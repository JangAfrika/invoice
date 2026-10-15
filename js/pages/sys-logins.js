/* System Admin > Sign-ins: every sign-in attempt, failures first to spot problems or attacks. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  let logins = [];
  let filter = 'all';

  function render() {
    const today = IM.todayISO();
    const local = (iso) => (iso ? IM.isoOf(new Date(iso)) : '');
    const weekAgo = Date.now() - 7 * 86400000;
    const tOk = logins.filter((l) => l.success && local(l.at) === today);
    const tBad = logins.filter((l) => !l.success && local(l.at) === today);
    const wBad = logins.filter((l) => !l.success && new Date(l.at).getTime() > weekAgo);
    $('sOk').textContent = tOk.length;
    $('sBad').textContent = tBad.length;
    $('sWeek').textContent = wBad.length;
    $('sPeople').textContent = new Set(tOk.map((l) => l.userId)).size;

    // logins with several failures in the last 24 hours (worth a look)
    const dayAgo = Date.now() - 86400000;
    const counts = {};
    logins.forEach((l) => { if (!l.success && new Date(l.at).getTime() > dayAgo) counts[l.login] = (counts[l.login] || 0) + 1; });
    const hot = Object.keys(counts).filter((k) => counts[k] >= 3).sort((a, b) => counts[b] - counts[a]);
    $('hot').hidden = !hot.length;
    $('hot').innerHTML = hot.length ? `<b>Watch:</b> ${hot.slice(0, 8).map((k) => `${esc(k)} (${counts[k]} failed)`).join(' · ')}` : '';

    const q = $('search').value.trim().toLowerCase();
    const list = logins.filter((l) => (filter === 'all' || (filter === 'ok' ? l.success : !l.success)) &&
      (!q || [l.login, l.user, l.company, l.reason, l.device].join(' ').toLowerCase().includes(q)));
    $('lBody').innerHTML = list.length ? list.slice(0, 600).map((l) => `
      <tr>
        <td style="white-space:nowrap">${esc(IM.dateTime(l.at))}<span class="sub">${esc(IM.ago(l.at))}</span></td>
        <td><b>${esc(l.user || '—')}</b><span class="sub">${esc(l.login)}</span></td>
        <td>${l.companyId ? `<a href="sys-companies.html?id=${encodeURIComponent(l.companyId)}">${esc(l.company)}</a>` : esc(l.company || '—')}</td>
        <td>${l.success ? IM.pill('Success', 'ok') : IM.pill('Failed')}</td>
        <td>${esc(l.reason || '')}</td>
        <td>${esc(l.device || '')}</td>
      </tr>`).join('') : '<tr><td colspan="6" class="empty">No sign-ins here.</td></tr>';
  }

  async function load() {
    IM.setMsg('lStatus', logins.length ? '' : 'Loading…');
    try {
      logins = (await IM.api({ action: 'sysLogins', limit: 2000 })).logins;
      render();
      IM.setMsg('lStatus', '');
    } catch (err) { IM.setMsg('lStatus', err.message, 'error'); }
  }

  IM.sysBoot({ page: 'logins', title: 'Sign-ins' }).then(() => {
    ['login', 'users', 'alert', 'clock'].forEach((n, i) => { const el = document.querySelectorAll('.stat .icon')[i]; if (el) el.innerHTML = IM.icon(n); });
    $('chips').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]');
      if (!b) return;
      filter = b.dataset.f;
      document.querySelectorAll('#chips button').forEach((x) => x.classList.toggle('active', x === b));
      render();
    });
    $('search').addEventListener('input', render);
    $('reloadBtn').addEventListener('click', load);
    load();
    setInterval(load, 60000);
  });
})();
