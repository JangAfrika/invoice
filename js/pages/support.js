/* Support: open tickets for the system administrator and follow the conversation (support.html?id=<ticket>). */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  let tickets = [];
  let current = null;

  const pillOf = (s) => `<span class="pill ${esc(String(s).toLowerCase())}">${esc(s)}</span>`;

  function renderList() {
    if (!tickets.length) {
      $('tkList').innerHTML = `<div class="empty-state">${IM.icon('ticket')}<div>No tickets yet.</div></div>`;
      return;
    }
    $('tkList').innerHTML = tickets.map((t) => `
      <button type="button" class="tk-item${current && current.id === t.id ? ' on' : ''}" data-id="${esc(t.id)}">
        <div class="t"><span>${esc(t.subject)}</span>${pillOf(t.status)}</div>
        <div class="m">${esc(t.no)} · ${esc(t.category)} · ${esc(t.priority)} · ${esc(IM.dateTime(t.updatedAt))}${t.lastReplyBy === 'Admin' ? ' · <b>answered</b>' : ''}</div>
      </button>`).join('');
  }

  function renderThread(out) {
    current = out.ticket;
    $('tkEmpty').hidden = true;
    $('tkView').hidden = false;
    $('tkSubject').textContent = current.subject;
    $('tkStatus').className = 'pill ' + current.status.toLowerCase();
    $('tkStatus').textContent = current.status;
    $('tkMeta').textContent = `${current.no} · ${current.category} · ${current.priority} priority · opened by ${current.userName} on ${IM.dateTime(current.createdAt)}`;
    $('tkThread').innerHTML = out.messages.map((m) => `
      <div class="bubble ${m.fromAdmin ? 'them' : 'me'}"><div class="by">${esc(m.author)} · ${esc(IM.dateTime(m.at))}</div>${esc(m.body)}</div>`).join('');
    const closed = current.status === 'Closed';
    $('tkReplyForm').hidden = closed;
    $('tkCloseBtn').hidden = current.status === 'Resolved' || closed;
    renderList();
  }

  async function open(id) {
    IM.setMsg('supStatus', 'Loading…');
    try {
      renderThread(await IM.api({ action: 'ticketThread', id }));
      IM.setMsg('supStatus', '');
      history.replaceState(null, '', 'support.html?id=' + encodeURIComponent(id));
    } catch (err) { IM.setMsg('supStatus', err.message, 'error'); }
  }

  async function load(openId) {
    try {
      const out = await IM.api({ action: 'myTickets' });
      tickets = out.tickets;
      if (out.supportEmail && !$('supInfo').dataset.done) {
        $('supInfo').dataset.done = '1';
        $('supInfo').textContent += ` You can also email ${out.supportEmail}.`;
      }
      renderList();
      if (openId) open(openId);
    } catch (err) { IM.setMsg('supStatus', err.message, 'error'); }
  }

  function newTicket() {
    $('tSubject').value = '';
    $('tBody').value = '';
    $('tCategory').value = 'Question';
    $('tPriority').value = 'Normal';
    $('tError').textContent = '';
    $('tkDialog').showModal();
    $('tSubject').focus();
  }

  IM.boot({ page: 'support' }).then(() => {
    $('newBtn').addEventListener('click', newTicket);
    $('tCancel').addEventListener('click', () => $('tkDialog').close());
    $('tkList').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) open(b.dataset.id); });

    $('tkForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const subject = $('tSubject').value.trim();
      const body = $('tBody').value.trim();
      if (subject.length < 3) { $('tError').textContent = 'Enter a short subject.'; return; }
      if (body.length < 3) { $('tError').textContent = 'Describe what you need.'; return; }
      $('tSave').disabled = true;
      try {
        const out = await IM.api({ action: 'createTicket', subject, body, category: $('tCategory').value, priority: $('tPriority').value });
        IM.track('ticket_created', { category: $('tCategory').value });
        $('tkDialog').close();
        IM.setMsg('supStatus', `Ticket ${out.ticket.no} sent. You will get an email when it is answered.`, 'ok');
        await load(out.ticket.id);
      } catch (err) { $('tError').textContent = err.message; }
      $('tSave').disabled = false;
    });

    $('tkReplyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = $('tkReply').value.trim();
      if (body.length < 3) { $('tkReplyErr').textContent = 'Write your reply.'; return; }
      $('tkReplyBtn').disabled = true;
      $('tkReplyErr').textContent = '';
      try {
        const out = await IM.api({ action: 'replyTicket', id: current.id, body });
        $('tkReply').value = '';
        renderThread(out);
        load();
      } catch (err) { $('tkReplyErr').textContent = err.message; }
      $('tkReplyBtn').disabled = false;
    });

    $('tkCloseBtn').addEventListener('click', async () => {
      if (!current || !await IM.confirm({ title: 'Close this ticket?', message: 'Mark this ticket as solved and close it.', detail: 'You can start a new ticket any time you need more help.', confirmText: 'Mark as solved' })) return;
      try {
        await IM.api({ action: 'closeTicket', id: current.id });
        await load(current.id);
      } catch (err) { IM.setMsg('supStatus', err.message, 'error'); }
    });

    load(IM.param('id'));
    if (IM.param('new')) newTicket();
  });
})();
