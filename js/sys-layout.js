/* System Admin portal shell: dark side menu, top bar with tickets bell, theme switch and account menu.
   Every sys-*.html page starts with IM.sysBoot({ page, title }). Only SystemAdmin users get in. */
(function () {
  const IM = (window.IM = window.IM || {});
  const esc = (s) => IM.esc(s);
  const ic = (n) => IM.icon(n);

  const NAV = [
    { page: 'dashboard', href: 'sys-dashboard.html', label: 'Dashboard', icon: 'dashboard' },
    { page: 'companies', href: 'sys-companies.html', label: 'Companies', icon: 'building', count: 'pending' },
    { page: 'users', href: 'sys-users.html', label: 'Users', icon: 'users' },
    { page: 'logins', href: 'sys-logins.html', label: 'Sign-ins', icon: 'key' },
    { page: 'tickets', href: 'sys-tickets.html', label: 'Tickets', icon: 'ticket', count: 'tickets' },
    { page: 'activity', href: 'sys-activity.html', label: 'Activity', icon: 'activity' },
    { page: 'settings', href: 'sys-settings.html', label: 'Settings', icon: 'settings' }
  ];

  // one choice for the whole app; the admin portal starts dark until a choice is made
  function theme(set) {
    let saved = null;
    try { saved = localStorage.getItem('im_theme'); } catch (e) { saved = null; }
    const t = set || saved || 'dark';
    if (set) IM.theme.set(set); else IM.theme.apply(t);
    return t;
  }
  IM.sysTheme = () => (document.body.classList.contains('light') ? 'light' : 'dark');

  // badge numbers in the menu and on the bell (pending companies, open tickets)
  IM.sysCounts = function (pending, tickets) {
    const set = (id, n) => { const el = IM.$(id); if (el && n != null) { el.textContent = n; el.hidden = !n; } };
    set('cnt-pending', pending);
    set('cnt-tickets', tickets);
    set('bellDot', tickets);
  };

  IM.sysBoot = function (opts) {
    const s = IM.store.read();
    const stop = () => new Promise(() => {});
    if (!s || !s.token) {
      location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search));
      return stop();
    }
    if (!s.user || s.user.role !== 'SystemAdmin') { location.replace(s.company ? 'dashboard.html' : 'login.html'); return stop(); }
    IM.session = s;
    IM.user = s.user;
    IM.company = null;

    const main = document.querySelector('main');
    const shell = document.createElement('div');
    shell.className = 'sys-shell';
    shell.innerHTML = `
      <aside class="sys-side" id="side">
        <a class="sys-brand" href="sys-dashboard.html"><span class="mark">${ic('shield')}</span><span>${esc((window.APP_CONFIG && window.APP_CONFIG.APP_NAME) || 'Invoice Manager')}</span></a>
        <nav class="sys-nav">${NAV.map((n) => `<a href="${n.href}" class="${n.page === opts.page ? 'active' : ''}">${ic(n.icon)}<span>${n.label}</span>${n.count ? `<span class="count" id="cnt-${n.count}" hidden></span>` : ''}</a>`).join('')}</nav>
        <div class="sys-foot">System administration</div>
      </aside>
      <div class="sys-main">
        <header class="sys-top">
          <button type="button" class="sys-menu-btn" id="menuBtn" aria-label="Menu">${ic('menu')}</button>
          <span class="crumb">${esc(opts.title || '')}</span>
          <div class="right">
            <button type="button" class="tbtn" id="themeBtn" title="Light / dark"></button>
            <a class="tbtn" href="sys-tickets.html" title="Open tickets">${ic('bell')}<span class="dot" id="bellDot" hidden></span></a>
            <div class="sys-user">
              <button type="button" id="userBtn"><span class="av">${esc(IM.initials(IM.user.name))}</span><span class="name">${esc(IM.user.name)}</span>${ic('chevron')}</button>
              <div class="menu" id="userMenu" hidden>
                <a href="sys-settings.html#me">My account</a>
                <button type="button" id="logoutBtn">Sign out</button>
              </div>
            </div>
          </div>
        </header>
      </div>`;
    document.body.insertBefore(shell, document.body.firstChild);
    shell.querySelector('.sys-main').appendChild(main);
    document.querySelectorAll('body > dialog, body > .drawer').forEach((d) => shell.querySelector('.sys-main').appendChild(d));

    theme();
    IM.$('themeBtn').addEventListener('click', () => theme(IM.sysTheme() === 'light' ? 'dark' : 'light'));
    IM.$('menuBtn').addEventListener('click', () => document.body.classList.toggle('side-open'));
    IM.$('userBtn').addEventListener('click', () => { IM.$('userMenu').hidden = !IM.$('userMenu').hidden; });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.sys-user')) IM.$('userMenu').hidden = true;
      if (document.body.classList.contains('side-open') && !e.target.closest('#side') && !e.target.closest('#menuBtn')) document.body.classList.remove('side-open');
    });
    IM.$('logoutBtn').addEventListener('click', () => IM.signOut(''));
    document.body.classList.remove('booting');

    // keep the badges current (cheap: the overview is one call)
    if (opts.page !== 'dashboard') {
      IM.api({ action: 'sysOverview' }).then((o) => IM.sysCounts(o.stats.pending, o.stats.openTickets)).catch(() => {});
    }
    return Promise.resolve(s);
  };

  // small shared helpers for the admin pages
  IM.pill = (text, cls) => `<span class="pill ${esc(String(cls || text).toLowerCase())}">${esc(text)}</span>`;
  IM.ago = (iso) => {
    if (!iso) return '—';
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    if (s < 86400 * 30) return Math.round(s / 86400) + ' days ago';
    return IM.dateTime(iso);
  };
  IM.drawer = function (html) {
    let d = IM.$('drawer');
    if (!d) {
      d = document.createElement('div');
      d.className = 'drawer';
      d.id = 'drawer';
      document.querySelector('.sys-main').appendChild(d);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') IM.closeDrawer(); });
    }
    d.hidden = false;
    d.innerHTML = `<button type="button" class="x" aria-label="Close" onclick="IM.closeDrawer()">${ic('x')}</button>` + html;
    return d;
  };
  IM.closeDrawer = () => { const d = IM.$('drawer'); if (d) d.hidden = true; };
})();
