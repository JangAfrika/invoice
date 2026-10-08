/* Every company page starts with IM.boot(): checks the sign-in, draws the blue side menu and the top bar,
   and applies the company look. System administrators are sent to their own portal (sys-*.html). */
(function () {
  const IM = (window.IM = window.IM || {});
  const esc = (s) => IM.esc(s);
  const ic = (n) => IM.icon(n);

  // grouped like a bookkeeping app: overview, money coming in, the company, help
  const NAV = [
    { group: '', items: [
      { page: 'dashboard', href: 'dashboard.html', label: 'Overview', icon: 'dashboard' },
      { page: 'profile', href: 'profile.html', label: 'Company profile', icon: 'profile', pending: true }
    ] },
    { group: 'Receivables', items: [
      { page: 'customers', href: 'customers.html', label: 'Customers', icon: 'customers' },
      { page: 'invoices', href: 'invoices.html', label: 'Invoices', icon: 'invoice' },
      { page: 'invoice-new', href: 'invoice-new.html', label: 'New invoice', icon: 'plus' },
      { page: 'receipts', href: 'receipts.html', label: 'Payments in', icon: 'receipt' }
    ] },
    { group: 'Company', admin: true, items: [
      { page: 'company', href: 'company.html', label: 'Settings', icon: 'settings', pending: true },
      { page: 'team', href: 'team.html', label: 'Team', icon: 'team' },
      { page: 'activity', href: 'activity.html', label: 'Activity', icon: 'activity' }
    ] },
    { group: '-', items: [
      { page: 'support', href: 'support.html', label: 'Support', icon: 'help', pending: true },
      { page: 'account', href: 'account.html', label: 'My account', icon: 'user', pending: true }
    ] }
  ];
  const PENDING_PAGES = ['profile', 'company', 'support', 'account'];

  const isPending = () => (IM.company && IM.company.status) === 'Pending';

  function sideHtml(page) {
    const c = IM.company || {};
    const pending = isPending();
    const groups = NAV.filter((g) => !g.admin || IM.isAdmin()).map((g) => {
      const items = g.items.map((n) => {
        const off = pending && !n.pending;
        return `<a href="${n.href}" class="${n.page === page ? 'active' : ''}${off ? ' off' : ''}"${n.page === page ? ' aria-current="page"' : ''}${off ? ' title="Available after approval"' : ''}>${ic(n.icon)}<span>${n.label}</span></a>`;
      }).join('');
      const head = g.group === '-' ? '<div class="side-sep"></div>' : (g.group ? `<div class="side-h">${g.group}</div>` : '');
      return head + items;
    }).join('');
    return `
      <a class="side-brand" href="${pending ? 'profile.html' : 'dashboard.html'}" title="${esc(c.name)}">
        <span class="side-logo" id="topLogoBox" hidden><img id="topLogo" alt=""></span>
        <span class="side-name" id="topCoName">${esc(c.name || '')}</span>
      </a>
      <div class="side-actions">
        <button type="button" class="act-btn" id="actBtn" aria-haspopup="true" aria-expanded="false">Actions ${ic('chevron')}</button>
        <div class="act-menu" id="actMenu" hidden>
          ${pending ? '' : `<a href="invoice-new.html">${ic('invoice')} New invoice</a>
          <a href="customers.html?add=1">${ic('customers')} Add customer</a>
          <a href="invoices.html?f=outstanding">${ic('money')} Record a payment</a>`}
          <a href="support.html?new=1">${ic('ticket')} Ask for help</a>
        </div>
      </div>
      <nav class="side-nav" aria-label="Main">${groups}</nav>
      <button type="button" class="side-install" id="installBtn" hidden>${ic('install')} Install app</button>`;
  }

  function barHtml() {
    const c = IM.company || {};
    const u = IM.user || {};
    return `
      <button type="button" class="iconbtn menu-btn" id="menuBtn" aria-label="Menu">${ic('menu')}</button>
      <form class="appsearch" id="appSearch" role="search">
        ${ic('search')}<input id="appSearchInput" type="search" placeholder="Search invoices and customers" aria-label="Search">
      </form>
      <div class="appbar-right">
        <div class="whois"><b id="topUser">${esc(u.name || '')}</b><span id="topCoLine">${esc(c.name || '')} · ${esc(u.role || '')}</span></div>
        <button type="button" class="topicon" id="themeBtn" title="Light / dark scheme"></button>
        <a class="topicon" href="support.html" title="Support">${ic('help')}<span>Help</span></a>
        ${IM.isAdmin() ? `<a class="topicon" href="company.html" title="Company settings">${ic('settings')}<span>Settings</span></a>` : ''}
        <button type="button" class="topicon" id="logoutBtn" title="Sign out">${ic('logout')}<span>Sign out</span></button>
      </div>`;
  }

  function showLogo(src) {
    const box = IM.$('topLogoBox');
    if (!box) return;
    if (src) { IM.$('topLogo').src = src; box.hidden = false; } else box.hidden = true;
  }

  function pendingBanner() {
    if (!isPending()) return '';
    return `<div class="pending-bar">${ic('clock')}<span><b>Your company is waiting for approval.</b> The system administrator has been told. Meanwhile, complete your company profile and upload your logo.</span></div>`;
  }

  // builds the shell around the page's <main> (pages may also already have the shell)
  function ensureShell() {
    let shell = document.querySelector('.shell');
    if (shell) return shell;
    shell = document.createElement('div');
    shell.className = 'shell';
    shell.innerHTML = '<aside class="side" id="side"></aside><div class="main"><header class="appbar"></header></div>';
    const main = shell.querySelector('.main');
    Array.from(document.body.children).forEach((el) => { if (el.tagName !== 'SCRIPT' && el.tagName !== 'HEADER') main.appendChild(el); });
    document.querySelectorAll('body > header.topbar').forEach((el) => el.remove());
    document.body.insertBefore(shell, document.body.firstChild);
    return shell;
  }

  function wire() {
    const side = IM.$('side');
    IM.$('menuBtn').addEventListener('click', () => document.body.classList.toggle('side-open'));
    document.addEventListener('click', (e) => {
      if (document.body.classList.contains('side-open') && !side.contains(e.target) && !IM.$('menuBtn').contains(e.target)) document.body.classList.remove('side-open');
      const menu = IM.$('actMenu');
      if (!menu.hidden && !e.target.closest('.side-actions')) { menu.hidden = true; IM.$('actBtn').setAttribute('aria-expanded', 'false'); }
    });
    IM.$('actBtn').addEventListener('click', () => {
      const menu = IM.$('actMenu');
      menu.hidden = !menu.hidden;
      IM.$('actBtn').setAttribute('aria-expanded', String(!menu.hidden));
    });
    IM.$('appSearch').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = IM.$('appSearchInput').value.trim();
      if (q) location.href = 'invoices.html?q=' + encodeURIComponent(q);
    });
    IM.$('logoutBtn').addEventListener('click', () => IM.signOut(''));
    IM.$('themeBtn').addEventListener('click', IM.theme.toggle);
    IM.theme.apply(IM.theme.get());
  }

  /**
   * opts: { page: 'invoices', admin: true when only Owner/Admin may open it }
   * Resolves once the page may run. Never resolves when the person is sent elsewhere.
   */
  IM.boot = function (opts) {
    opts = opts || {};
    const s = IM.store.read();
    const stop = () => new Promise(() => {});
    if (!s || !s.token) {
      const here = location.pathname.split('/').pop() + location.search;
      location.replace('login.html?next=' + encodeURIComponent(here));
      return stop();
    }
    if (s.user && s.user.role === 'SystemAdmin') { location.replace('sys-dashboard.html'); return stop(); }
    if (!s.company) { IM.store.clear(); location.replace('login.html'); return stop(); }
    IM.session = s;
    IM.user = s.user;
    IM.company = s.company;
    if (opts.admin && !IM.isAdmin()) { location.replace('dashboard.html'); return stop(); }
    if (isPending() && PENDING_PAGES.indexOf(opts.page) < 0) { location.replace('profile.html'); return stop(); }

    IM.applyBrand();
    ensureShell();
    document.body.classList.add('app');
    IM.$('side').innerHTML = sideHtml(opts.page);
    const bar = document.querySelector('header.appbar');
    bar.innerHTML = barHtml();
    const old = document.querySelector('.pending-bar');
    if (old) old.remove();
    if (isPending()) bar.insertAdjacentHTML('afterend', pendingBanner());
    wire();
    if (IM.initInstall) IM.initInstall();
    if (opts.page === 'invoices' && IM.param('q')) IM.$('appSearchInput').value = IM.param('q');

    IM.loadLogo().then(showLogo);
    document.addEventListener('im:logo', (e) => showLogo(e.detail));
    document.addEventListener('im:company', () => {
      IM.$('topCoName').textContent = IM.company.name;
      // approved (or suspended) while the page was open: reload so the menu and pages match
      if (opts.page && (isPending() !== !!document.querySelector('.pending-bar'))) location.reload();
    });
    document.addEventListener('im:user', () => { IM.$('topUser').textContent = IM.user.name; });

    document.body.classList.remove('booting');
    return Promise.resolve(s);
  };
})();
