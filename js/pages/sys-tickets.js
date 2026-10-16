/* System Admin > Tickets: every company's support tickets; reply, change status, resolve. The company gets an email. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  let tickets = [];
  let current = null;
  let filter = 'open';

  const isOpen = (t) => t.status !== 'Resolved' && t.status !== 'Closed';

  function renderList() {
    const q = $('search').value.trim().toLowerCase();
    const list = tickets.filter((t) => (filter === 'all' || (filter === 'open' ? isOpen(t) : !isOpen(t))) &&
      (!q || [t.subject, t.company, t.userName, t.no, t.category].join(' ').toLowerCase().includes(q)));
    $('tOpen').textContent = tickets.filter(isOpen).length;
    $('tDone').textContent = tickets.filter((t) => !isOpen(t)).length;
    $('tAll').textContent = tickets.length;
    IM.sysCounts(null, tickets.filter(isOpen).length);
    $('tkList').innerHTML = list.length ? list.map((t) => `
      <button type="button" class="tk-item${current && current.id === t.id ? ' on' : ''}" data-id="${esc(t.id)}">
        <div class="t"><span>${esc(t.subject)}</span>${IM.pill(t.status)}</div>
        <div class="m">${esc(t.company)} · ${esc(t.userName)} · ${IM.pill(t.priority)} · ${esc(IM.ago(t.updatedAt))}${t.lastReplyBy === 'Company' && isOpen(t) ? ' · <b>needs reply</b>' : ''}</div>
      </button>`).join('') : '<div class="empty">No tickets here.</div>';
  }

  function renderThread(out) {
    current = out.ticket;
    $('tkEmpty').hidden = true;
    $('tkView').hidden = false;
    $('tkSubject').textContent = current.subject;
    $('tkStatusPill').outerHTML = `<span id="tkStatusPill">${IM.pill(current.status)}</span>`;
    $('tkMeta').innerHTML = `${esc(current.no)} · <a href="sys-companies.html?id=${encodeURIComponent(current.companyId)}">${esc(current.company)}</a> · ${esc(current.userName)}${current.userEmail ? ' &lt;' + esc(current.userEmail) + '&gt;' : ''} · ${esc(current.category)} · ${esc(current.priority)} priority · opened ${esc(IM.dateTime(current.createdAt))}`;
    $('tkThread').innerHTML = out.messages.map((m) => `
      <div class="bubble ${m.fromAdmin ? 'me' : 'them'}"><div class="by">${esc(m.author)} · ${esc(IM.dateTime(m.at))}</div>${esc(m.body)}</div>`).join('');
    $('tkNewStatus').value = '';
    renderList();
  }

  async function open(id) {
    try {
      renderThread(await IM.api({ action: 'sysTicket', id }));
      history.replaceState(null, '', 'sys-tickets.html?id=' + encodeURIComponent(id));
    } catch (err) { IM.setMsg('tStatus', err.message, 'error'); }
  }

  async function load() {
    try {
      tickets = (await IM.api({ action: 'sysTickets' })).tickets;
      renderList();
    } catch (err) { IM.setMsg('tStatus', err.message, 'error'); }
  }

  async function send(status) {
    const body = $('tkReply').value.trim();
    const st = status || $('tkNewStatus').value;
    if (!body && !st) { $('tkErr').textContent = 'Write a reply or choose a status.'; return; }
    $('tkErr').textContent = '';
    $('tkSend').disabled = true;
    try {
      const out = await IM.api({ action: 'sysReplyTicket', id: current.id, body, status: st });
      $('tkReply').value = '';
      renderThread(out);
      IM.setMsg('tStatus', body ? 'Reply sent. The person who opened it has been emailed.' : 'Status changed.', 'ok');
      load();
    } catch (err) { $('tkErr').textContent = err.message; }
    $('tkSend').disabled = false;
  }

  IM.sysBoot({ page: 'tickets', title: 'Tickets' }).then(() => {
    $('chips').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]');
      if (!b) return;
      filter = b.dataset.f;
      document.querySelectorAll('#chips button').forEach((x) => x.classList.toggle('active', x === b));
      renderList();
    });
    $('search').addEventListener('input', renderList);
    $('tkList').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) open(b.dataset.id); });
    $('tkForm').addEventListener('submit', (e) => { e.preventDefault(); send(''); });
    $('tkResolve').addEventListener('click', () => send('Resolved'));
    load().then(() => { if (IM.param('id')) open(IM.param('id')); });
    setInterval(load, 60000);
  });
})();
