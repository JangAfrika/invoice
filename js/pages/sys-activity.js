/* System Admin > Activity: what happened in every company (newest first). */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  let rows = [];

  function render() {
    const q = $('search').value.trim().toLowerCase();
    const co = $('coFilter').value;
    const list = rows.filter((r) => (!co || r.company === co) &&
      (!q || [r.company, r.user, r.action, r.details, r.entity].join(' ').toLowerCase().includes(q)));
    $('aBody').innerHTML = list.length ? list.slice(0, 800).map((r) => `
      <tr><td style="white-space:nowrap">${esc(IM.dateTime(r.at))}</td>
        <td>${r.companyId ? `<a href="sys-companies.html?id=${encodeURIComponent(r.companyId)}">${esc(r.company)}</a>` : esc(r.company)}</td>
        <td>${esc(r.user)}</td><td>${esc(r.action)}</td><td>${esc(r.details || '')}</td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">Nothing found.</td></tr>';
  }

  async function load() {
    IM.setMsg('aStatus', rows.length ? '' : 'Loading…');
    try {
      rows = (await IM.api({ action: 'sysActivity', limit: 2000 })).activity;
      const names = Array.from(new Set(rows.map((r) => r.company).filter(Boolean))).sort();
      const keep = $('coFilter').value;
      $('coFilter').innerHTML = '<option value="">All companies</option>' + names.map((n) => `<option${n === keep ? ' selected' : ''}>${esc(n)}</option>`).join('');
      render();
      IM.setMsg('aStatus', '');
    } catch (err) { IM.setMsg('aStatus', err.message, 'error'); }
  }

  IM.sysBoot({ page: 'activity', title: 'Activity' }).then(() => {
    $('search').addEventListener('input', render);
    $('coFilter').addEventListener('change', render);
    $('reloadBtn').addEventListener('click', load);
    load();
  });
})();
