/* One invoice in full: who, when, the lines, every payment received (each opens its receipt), and the actions. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  let invoices = [], payments = [], customers = [];
  const id = IM.param('id');

  const kv = (rows) => `<dl class="kv">${rows.filter((r) => r[1] !== '' && r[1] != null).map((r) => `<dt>${esc(r[0])}</dt><dd>${r[2] ? r[1] : esc(r[1])}</dd>`).join('')}</dl>`;

  async function render(inv, lines) {
    const s = IM.displayStatus(inv);
    const pays = payments.filter((p) => p.invoiceId === inv.id).sort((a, b) => (a.date || '').localeCompare(b.date || '') || IM.numOf(a.receiptNo) - IM.numOf(b.receiptNo));
    const cust = customers.find((c) => c.id === inv.customerId);
    document.title = 'Invoice ' + inv.no + ' · Invoice Manager';
    $('dTitle').innerHTML = `Invoice ${esc(inv.no)} <span class="pill ${s.toLowerCase()}" style="font-size:12px;vertical-align:middle">${s}</span>`;
    $('dCrumbs').innerHTML = `<a href="invoices.html">Invoices</a> › ${esc(inv.no)}`;

    const canPay = inv.status === 'Unpaid' || inv.status === 'Partial';
    const canEdit = inv.status === 'Unpaid' && (inv.paid || 0) <= 0.005 && IM.withinEditWindow(inv.createdAt);
    $('dActions').innerHTML = [
      canPay ? '<button type="button" class="primary" data-act="pay">Record payment</button>' : '',
      inv.hasPdf ? '<button type="button" data-act="pdf">Open PDF</button>' : '',
      inv.hasPdf && inv.status !== 'Cancelled' ? `<button type="button" data-act="send">${inv.sentAt ? 'Send again' : 'Send'}</button>` : '',
      canEdit ? `<a class="btn" href="invoice-new.html?edit=${encodeURIComponent(inv.id)}">Edit</a>` : ''
    ].join('');

    $('dBody').innerHTML = `
      <div class="cards">
        <div class="card"><div class="k">Invoice total</div><div class="v">${IM.money(inv.total)}</div><div class="s">${lines.length} line${lines.length === 1 ? '' : 's'}</div></div>
        <a class="card green" href="#payments"><div class="k">Paid so far</div><div class="v">${IM.money(inv.paid)}</div><div class="s">${pays.length} payment${pays.length === 1 ? '' : 's'}</div></a>
        <div class="card ${inv.balance > 0.005 && inv.status !== 'Cancelled' ? 'red' : ''}"><div class="k">Balance owed</div><div class="v">${inv.status === 'Cancelled' ? '—' : IM.money(inv.balance)}</div><div class="s">${inv.due ? 'due ' + esc(IM.shortDate(inv.due)) : 'no due date'}</div></div>
      </div>
      <div class="dgrid">
        <div class="dpanel"><h3>Invoice details</h3>${kv([
          ['Invoice no', inv.no], ['Date', IM.prettyDate(inv.date)], ['Due date', inv.due ? IM.prettyDate(inv.due) : 'On receipt'],
          ['Status', s], ['Created by', inv.createdBy], ['Signed', inv.signed ? 'Yes' : 'Not signed'],
          ['Last emailed', inv.sentAt ? IM.shortDate(inv.sentAt.slice(0, 10)) + (inv.sentTo ? ' to ' + inv.sentTo : '') : '']
        ])}</div>
        <div class="dpanel"><h3>Customer</h3>${kv([
          ['Name', IM.custLink(inv), true],
          ['Email', cust && cust.email], ['Phone', cust && cust.phone], ['Address', cust && cust.address]
        ])}<p style="margin:10px 0 0;font-size:12.5px"><a class="lnk" href="invoices.html?customer=${encodeURIComponent(inv.customerId || '')}">All invoices for this customer</a></p></div>
        <div class="dpanel wide"><h3>Items</h3><div class="tablewrap"><table class="inv"><thead><tr><th>#</th><th>Item</th><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead><tbody>
          ${lines.length ? lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.item)}</td><td class="wrap">${esc(l.desc)}</td><td class="num">${esc(l.qty)}</td><td class="num">${IM.money(l.price)}</td><td class="num">${IM.money(l.amount)}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">No line items.</td></tr>'}
          <tr><td colspan="5" class="num"><b>Total</b></td><td class="num"><b>${IM.money(inv.total)}</b></td></tr></tbody></table></div>
          ${inv.notes ? `<p style="font-size:12.5px;margin:10px 0 0"><b>Notes:</b> ${esc(inv.notes)}</p>` : ''}</div>
        <div class="dpanel wide" id="payments"><h3>Payments received</h3><div class="tablewrap"><table class="inv"><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th class="num">Amount</th><th class="num">Balance after</th></tr></thead><tbody>
          ${pays.length ? pays.map((p) => `<tr><td><b>${IM.rcLink(p)}</b>${p.signed ? '<span class="sub">signed</span>' : '<span class="sub">not signed</span>'}</td><td>${esc(IM.shortDate(p.date))}</td><td>${esc(p.method || '—')}</td><td class="num">${IM.money(p.amount)}</td><td class="num">${IM.money(p.balanceAfter)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">No payments yet.</td></tr>'}
        </tbody></table></div></div>
      </div>`;
  }

  async function load() {
    IM.setMsg('dStatus', 'Loading…');
    try {
      await IM.loadList((data) => { invoices = data.invoices; payments = data.payments; customers = data.customers; });
      const inv = invoices.find((i) => i.id === id);
      if (!inv) { IM.setMsg('dStatus', 'That invoice was not found. It may have been deleted.', 'error'); $('dBody').innerHTML = '<p><a class="lnk" href="invoices.html">Back to invoices</a></p>'; return; }
      const out = await IM.api({ action: 'invoiceItems', invoiceId: inv.id });
      IM.setMsg('dStatus', '');
      render(inv, out.lines || []);
    } catch (err) { IM.setMsg('dStatus', err.message, 'error'); }
  }

  IM.boot({ page: 'invoices' }).then(() => {
    $('dActions').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      const inv = invoices.find((i) => i.id === id);
      if (!b || !inv) return;
      if (b.dataset.act === 'pay') return IM.Payments.record(inv, () => { IM.dropList(); load(); });
      if (b.dataset.act === 'pdf') return IM.openPdf('invoice', inv.id, (err) => IM.setMsg('dStatus', err.message, 'error'));
      if (b.dataset.act === 'send') {
        const email = IM.Send.emailOf(customers, inv.customerId);
        return IM.Send.open({ kind: 'invoice', id: inv.id, no: inv.no, client: inv.client, email, customerHasEmail: !!email, balance: inv.balance, due: inv.due, sentTo: inv.sentTo,
          onDone: (out) => { IM.setMsg('dStatus', `Invoice ${inv.no} sent to ${out.sentTo}.`, 'ok'); IM.dropList(); load(); } });
      }
    });
    load();
  });
})();
