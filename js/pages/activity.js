/* Activity (Owner / Admin): who changed what, and when. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  let rows = [];

  function render() {
    const q = $('search').value.trim().toLowerCase();
    const list = rows.filter((r) => !q || [r.user, r.action, r.details, r.entity].some((v) => String(v || '').toLowerCase().includes(q)));
    $('actBody').innerHTML = list.length
      ? list.map((r) => `
        <tr>
          <td>${esc(IM.dateTime(r.at))}</td>
          <td>${esc(r.user)}</td>
          <td>${esc(r.action)}</td>
          <td class="wrap">${esc(r.details)}</td>
        </tr>`).join('')
      : `<tr><td colspan="4" class="empty">${rows.length ? 'Nothing matches your search.' : 'No activity yet.'}</td></tr>`;
  }

  async function load() {
    IM.setMsg('actStatus', 'Loading…');
    try {
      rows = (await IM.api({ action: 'activity', limit: 500 })).activity;
      render();
      IM.setMsg('actStatus', rows.length >= 500 ? 'Showing the latest 500 entries.' : '');
    } catch (err) {
      IM.setMsg('actStatus', err.message, 'error');
    }
  }

  IM.boot({ page: 'activity', admin: true }).then(() => {
    $('search').addEventListener('input', render);
    $('reloadBtn').addEventListener('click', load);
    load();
  });
})();
