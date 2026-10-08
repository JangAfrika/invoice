/* Invoices: totals, filters, record payments, edit, cancel/reopen, open saved PDFs.
   invoices.html?customer=<id> shows one customer's invoices. */
(function () {
  const IM = window.IM;
  const { $, esc, sum } = IM;
  let invoices = [];
  let customers = [];
  let filter = IM.param('f') || 'all';
  const customerFilter = IM.param('customer');
  let view = IM.view.get('invoices');

  function displayStatus(inv) {
    if (inv.status === 'Cancelled') return 'Cancelled';
    if (inv.status === 'Paid') return 'Paid';
    if (inv.due && inv.due < IM.todayISO()) return 'Overdue';
    return inv.status === 'Partial' ? 'Partial' : 'Unpaid';
  }

  // only admins delete, and only cancelled invoices that never had a receipt
  const canDelete = (i) => i.status === 'Cancelled' && IM.isAdmin() && !(i.paid > 0.005);

  function render() {
    const scoped = customerFilter ? invoices.filter((i) => i.customerId === customerFilter) : invoices;
    if (customerFilter) {
      const c = customers.find((x) => x.id === customerFilter);
      $('custFilter').hidden = false;
      $('custFilterName').textContent = c ? c.name : 'one customer';
    }
    const live = scoped.filter((i) => i.status !== 'Cancelled');
    const overdue = live.filter((i) => displayStatus(i) === 'Overdue');
    const outstanding = live.filter((i) => i.status !== 'Paid');
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

    $('sInvoiced').textContent = IM.money(sum(live, 'total'));
    $('sInvoicedN').textContent = plural(live.length, 'invoice');
    $('sPaid').textContent = IM.money(sum(live, 'paid'));
    $('sPaidN').textContent = live.filter((i) => i.status === 'Paid').length + ' fully paid';
    $('sOut').textContent = IM.money(sum(outstanding, 'balance'));
    $('sOutN').textContent = outstanding.length + ' not fully paid';
    $('sOver').textContent = IM.money(sum(overdue, 'balance'));
    $('sOverN').textContent = overdue.length + ' past due date';

    const q = $('search').value.trim().toLowerCase();
    const list = scoped.filter((i) => {
      const s = displayStatus(i);
      if (filter === 'outstanding' && !(i.status === 'Unpaid' || i.status === 'Partial')) return false;
      if (filter === 'paid' && i.status !== 'Paid') return false;
      if (filter === 'overdue' && s !== 'Overdue') return false;
      if (filter === 'cancelled' && i.status !== 'Cancelled') return false;
      if (q && !(i.no.toLowerCase().includes(q) || i.client.toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || IM.numOf(b.no) - IM.numOf(a.no));

    $('tableView').hidden = view !== 'list';
    $('gridView').hidden = view !== 'grid';
    const none = scoped.length ? 'No invoices match this filter.' : 'No invoices yet. Create one under <a href="invoice-new.html">New invoice</a>.';
    if (!list.length) {
      $('invBody').innerHTML = `<tr><td colspan="8" class="empty">${none}</td></tr>`;
      $('gridView').innerHTML = `<div class="empty-state">${IM.icon('invoice')}<div>${none}</div></div>`;
      return;
    }
    if (view === 'grid') { $('gridView').innerHTML = list.map(card).join(''); return; }

    $('invBody').innerHTML = list.map((i) => {
      const s = displayStatus(i);
      const canPay = i.status === 'Unpaid' || i.status === 'Partial';
      const canEdit = i.status === 'Unpaid' && (i.paid || 0) <= 0.005 && IM.withinEditWindow(i.createdAt);
      return `
        <tr>
          <td><b>${esc(i.no)}</b><span class="sub">${esc(IM.shortDate(i.date))}${i.signed ? ' · signed' : ''}</span></td>
          <td class="wrap">${esc(i.client)}<span class="sub">${esc(i.items)}</span></td>
          <td>${i.due ? esc(IM.shortDate(i.due)) : '<span class="sub">—</span>'}</td>
          <td class="num">${IM.money(i.total)}</td>
          <td class="num">${IM.money(i.paid)}${i.lastPay ? `<span class="sub">${esc(IM.shortDate(i.lastPay))}${i.method ? ' · ' + esc(i.method) : ''}</span>` : ''}</td>
          <td class="num">${i.status === 'Cancelled' ? '—' : IM.money(i.balance)}</td>
          <td><span class="pill ${s.toLowerCase()}">${s}</span></td>
          <td><div class="acts">
            ${canPay ? `<button type="button" class="pay" data-act="pay" data-id="${esc(i.id)}">Record payment</button>` : ''}
            ${canEdit ? `<a href="invoice-new.html?edit=${encodeURIComponent(i.id)}">Edit</a>` : ''}
            ${i.hasPdf ? `<button type="button" data-act="pdf" data-id="${esc(i.id)}">PDF</button>` : ''}
            ${i.hasPdf && i.status !== 'Cancelled' ? `<button type="button" data-act="send" data-id="${esc(i.id)}" title="${i.sentTo ? 'Last sent to ' + esc(i.sentTo) : 'Email it to the client'}">${i.sentAt ? 'Send again' : 'Send'}</button>` : ''}
            ${i.status === 'Cancelled'
              ? `<button type="button" data-act="reopen" data-id="${esc(i.id)}">Reopen</button>${canDelete(i) ? `<button type="button" class="danger" data-act="delete" data-id="${esc(i.id)}">Delete</button>` : ''}`
              : (i.status !== 'Paid' ? `<button type="button" data-act="cancel" data-id="${esc(i.id)}">Cancel</button>` : '')}
          </div></td>
        </tr>`;
    }).join('');
  }

  // grid view: one card per invoice, like a document inbox
  function card(i) {
    const s = displayStatus(i);
    const canPay = i.status === 'Unpaid' || i.status === 'Partial';
    const canEdit = i.status === 'Unpaid' && (i.paid || 0) <= 0.005 && IM.withinEditWindow(i.createdAt);
    const canSend = i.hasPdf && i.status !== 'Cancelled';
    const main = canPay ? `<button type="button" class="primary-act pay" data-act="pay" data-id="${esc(i.id)}">Record payment</button>`
      : (canSend ? `<button type="button" class="primary-act" data-act="send" data-id="${esc(i.id)}">Send</button>` : '');
    const menu = [
      i.hasPdf ? `<button type="button" data-act="pdf" data-id="${esc(i.id)}">Open PDF</button>` : '',
      canSend && canPay ? `<button type="button" data-act="send" data-id="${esc(i.id)}">Send by email</button>` : '',
      canEdit ? `<a href="invoice-new.html?edit=${encodeURIComponent(i.id)}">Edit</a>` : '',
      `<a href="invoices.html?customer=${encodeURIComponent(i.customerId || '')}">Customer's invoices</a>`,
      i.status === 'Cancelled' ? `<button type="button" data-act="reopen" data-id="${esc(i.id)}">Reopen</button>${canDelete(i) ? `<button type="button" data-act="delete" data-id="${esc(i.id)}">Delete invoice</button>` : ''}`
        : (i.status !== 'Paid' ? `<button type="button" data-act="cancel" data-id="${esc(i.id)}">Cancel invoice</button>` : '')
    ].join('');
    return `
      <article class="doccard">
        <div class="thumb">
          ${i.sentAt ? `<span class="sentflag" title="${esc(i.sentTo)}">Sent ${esc(IM.shortDate(i.sentAt.slice(0, 10)))}</span>` : ''}
          <span class="badge pill ${s.toLowerCase()}">${s}</span>
          <div class="paper"><i class="b"></i><i></i><i class="s"></i><i></i><i></i><i class="s"></i></div>
        </div>
        <div class="body">
          <div class="who" title="${esc(i.client)}">${esc(i.client)}</div>
          <div class="row"><span>${esc(i.no)}</span><span>${esc(IM.shortDate(i.date))}</span></div>
          <div class="row"><span>${i.due ? 'Due ' + esc(IM.shortDate(i.due)) : 'No due date'}</span><span>${i.signed ? 'Signed' : ''}</span></div>
          <div class="row amt"><span>Total <b>${IM.money(i.total)}</b></span>${i.status !== 'Cancelled' && i.balance > 0.005 ? `<span>Owes <b>${IM.money(i.balance)}</b></span>` : ''}</div>
        </div>
        <div class="foot">
          <div class="more"><button type="button" data-act="more">More actions ${IM.icon('chevron')}</button><div class="menu" hidden>${menu}</div></div>
          ${main}
        </div>
      </article>`;
  }

  async function load() {
    IM.setMsg('trackStatus', 'Loading…');
    try {
      await IM.loadList((data, cached) => {
        invoices = data.invoices; customers = data.customers;
        render();
        IM.setMsg('trackStatus', cached ? 'Updating…' : '');
      });
      IM.setMsg('trackStatus', '');
    } catch (err) {
      IM.setMsg('trackStatus', err.message, 'error');
    }
  }

  IM.boot({ page: 'invoices' }).then(() => {
    if (IM.param('q')) $('search').value = IM.param('q');
    document.querySelectorAll('#chips button').forEach((b) => b.classList.toggle('active', b.dataset.f === filter));
    IM.view.wire('viewToggle', 'invoices', (v) => { view = v; render(); });
    $('chips').addEventListener('click', (e) => {
      if (!e.target.dataset.f) return;
      filter = e.target.dataset.f;
      document.querySelectorAll('#chips button').forEach((b) => b.classList.toggle('active', b.dataset.f === filter));
      render();
    });
    $('search').addEventListener('input', render);
    $('reloadBtn').addEventListener('click', load);

    const onAct = async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'more') {
        const menu = btn.nextElementSibling;
        document.querySelectorAll('.doccard .menu').forEach((m) => { if (m !== menu) m.hidden = true; });
        menu.hidden = !menu.hidden;
        return;
      }
      document.querySelectorAll('.doccard .menu').forEach((m) => { m.hidden = true; });
      const inv = invoices.find((i) => i.id === btn.dataset.id);
      if (!inv) return;
      if (act === 'pay') return IM.Payments.record(inv, load);
      if (act === 'send') {
        const email = IM.Send.emailOf(customers, inv.customerId);
        return IM.Send.open({ kind: 'invoice', id: inv.id, no: inv.no, client: inv.client, email, customerHasEmail: !!email,
          balance: inv.balance, due: inv.due, sentTo: inv.sentTo,
          onDone: (out) => { IM.setMsg('trackStatus', `Invoice ${inv.no} sent to ${out.sentTo}.`, 'ok'); load(); } });
      }
      if (act === 'pdf') return IM.openPdf('invoice', inv.id, (err) => IM.setMsg('trackStatus', err.message, 'error'));
      if (act === 'delete') {
        if (!await IM.confirm({ title: 'Delete invoice?', message: `Delete cancelled invoice ${inv.no} for ${inv.client}.`, detail: 'This permanently removes the invoice and its saved PDF. It cannot be undone.', confirmText: 'Delete', danger: true })) return;
        try {
          IM.setMsg('trackStatus', 'Deleting…');
          await IM.api({ action: 'deleteInvoice', invoiceId: inv.id });
          IM.track('invoice_deleted');
          IM.dropList();
          await load();
          IM.setMsg('trackStatus', `Invoice ${inv.no} deleted.`, 'ok');
        } catch (err) {
          IM.setMsg('trackStatus', err.message, 'error');
        }
        return;
      }
      if (act === 'cancel' || act === 'reopen') {
        const ok = await IM.confirm(act === 'cancel'
          ? { title: 'Cancel invoice?', message: `Cancel invoice ${inv.no} for ${inv.client}.`, detail: 'It stays on record but no longer counts as money owed. You can reopen it later.', confirmText: 'Cancel invoice', cancelText: 'Keep invoice', danger: true }
          : { title: 'Reopen invoice?', message: `Reopen invoice ${inv.no} for ${inv.client}. It counts as money owed again.`, confirmText: 'Reopen' });
        if (!ok) return;
        try {
          IM.setMsg('trackStatus', 'Updating…');
          await IM.api({ action: 'setCancelled', invoiceId: inv.id, cancelled: act === 'cancel' });
          IM.dropList();
          await load();
        } catch (err) {
          IM.setMsg('trackStatus', err.message, 'error');
        }
      }
    };
    $('invBody').addEventListener('click', onAct);
    $('gridView').addEventListener('click', onAct);
    document.addEventListener('click', (e) => { if (!e.target.closest('.more')) document.querySelectorAll('.doccard .menu').forEach((m) => { m.hidden = true; }); });
    load();
  });
})();
