/* One receipt (payment) in full, with links to its invoice, its customer and the other payments on that invoice. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  let invoices = [], payments = [], customers = [];
  const id = IM.param('id');
  const kv = (rows) => `<dl class="kv">${rows.filter((r) => r[1] !== '' && r[1] != null).map((r) => `<dt>${esc(r[0])}</dt><dd>${r[2] ? r[1] : esc(r[1])}</dd>`).join('')}</dl>`;

  function render(p) {
    const inv = invoices.find((i) => i.id === p.invoiceId);
    const cust = customers.find((c) => c.id === p.customerId);
    const others = p.direct ? [] : payments.filter((x) => x.invoiceId === p.invoiceId).sort((a, b) => (a.date || '').localeCompare(b.date || '') || IM.numOf(a.receiptNo) - IM.numOf(b.receiptNo));
    const latest = p.direct || (others.length && others[others.length - 1].id === p.id);
    const canEdit = latest && IM.withinEditWindow(p.recordedAt);
    document.title = 'Receipt ' + p.receiptNo + ' · Invoice Manager';
    $('dTitle').innerHTML = `Receipt ${esc(p.receiptNo)} <span class="pill ${p.balanceAfter <= 0.005 ? 'paid' : 'partial'}" style="font-size:12px;vertical-align:middle">${p.direct ? 'No invoice' : p.balanceAfter <= 0.005 ? 'Paid in full' : 'Part payment'}</span>`;
    $('dCrumbs').innerHTML = `<a href="receipts.html">Payments in</a> › ${esc(p.receiptNo)}`;
    $('dActions').innerHTML = [
      !p.signed ? '<button type="button" class="primary" data-act="make">Sign &amp; create PDF</button>' : '',
      p.hasPdf ? '<button type="button" data-act="pdf">Open PDF</button>' : '',
      p.hasPdf ? `<button type="button" data-act="send">${p.sentAt ? 'Send again' : 'Send'}</button>` : '',
      canEdit ? '<button type="button" data-act="edit">Edit</button>' : '',
      IM.isOwner() ? '<button type="button" class="danger" data-act="delete">Delete</button>' : ''
    ].join('');
    $('dBody').innerHTML = `
      <div class="cards">
        <div class="card green"><div class="k">Amount received</div><div class="v">${IM.money(p.amount)}</div><div class="s">${esc(IM.shortDate(p.date))}${p.method ? ' · ' + esc(p.method) : ''}</div></div>
        ${p.direct ? `<div class="card"><div class="k">For</div><div class="v" style="font-size:15px">${esc(p.note || 'Payment received')}</div><div class="s">paid directly, no invoice</div></div>` : (inv ? `<a class="card" href="${esc(IM.href.invoice(inv.id))}"><div class="k">Invoice ${esc(inv.no)}</div><div class="v">${IM.money(p.invoiceTotal)}</div><div class="s">total of the invoice</div></a>` : `<div class="card"><div class="k">Invoice total</div><div class="v">${IM.money(p.invoiceTotal)}</div></div>`)}
        ${p.direct ? '' : `<div class="card ${p.balanceAfter > 0.005 ? 'red' : ''}"><div class="k">Balance after this payment</div><div class="v">${IM.money(p.balanceAfter)}</div><div class="s">${IM.money(p.paidToDate)} paid to date</div></div>`}
      </div>
      <div class="dgrid">
        <div class="dpanel"><h3>Receipt details</h3>${kv([
          ['Receipt no', p.receiptNo], ['Date', IM.prettyDate(p.date)], ['Method', p.method], ['Note', p.note],
          ['Invoice', p.direct ? 'None, paid directly' : (inv ? IM.invLink(inv) : p.invoiceNo), !p.direct && !!inv], ['Signed', p.signed ? 'Yes' : 'Not signed yet'],
          ['Recorded by', p.recordedBy], ['Last emailed', p.sentAt ? IM.shortDate(p.sentAt.slice(0, 10)) + (p.sentTo ? ' to ' + p.sentTo : '') : '']
        ])}</div>
        <div class="dpanel"><h3>Received from</h3>${kv([
          ['Customer', IM.custLink(p), true], ['Email', cust && cust.email], ['Phone', cust && cust.phone]
        ])}</div>
        ${p.direct ? '' : `<div class="dpanel wide"><h3>All payments on invoice ${esc(p.invoiceNo)}</h3><div class="tablewrap"><table class="inv"><thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th class="num">Amount</th><th class="num">Balance after</th></tr></thead><tbody>
          ${others.map((x) => `<tr${x.id === p.id ? ' style="font-weight:700"' : ''}><td>${IM.rcLink(x)}</td><td>${esc(IM.shortDate(x.date))}</td><td>${esc(x.method || '—')}</td><td class="num">${IM.money(x.amount)}</td><td class="num">${IM.money(x.balanceAfter)}</td></tr>`).join('')}
        </tbody></table></div></div>`}
      </div>`;
  }

  async function load() {
    IM.setMsg('dStatus', 'Loading…');
    try {
      await IM.loadList((data) => { invoices = data.invoices; payments = data.payments; customers = data.customers; });
      const p = payments.find((x) => x.id === id);
      if (!p) { IM.setMsg('dStatus', 'That receipt was not found.', 'error'); $('dBody').innerHTML = '<p><a class="lnk" href="receipts.html">Back to payments in</a></p>'; return; }
      IM.setMsg('dStatus', '');
      render(p);
    } catch (err) { IM.setMsg('dStatus', err.message, 'error'); }
  }

  IM.boot({ page: 'receipts' }).then(() => {
    const reload = () => { IM.dropList(); load(); };
    $('dActions').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      const p = payments.find((x) => x.id === id);
      if (!b || !p) return;
      const act = b.dataset.act;
      if (act === 'delete') {
        return IM.Payments.removeReceipt(p).then((done) => { if (done) location.replace('receipts.html'); }).catch((err) => IM.setMsg('dStatus', err.message, 'error'));
      }
      if (act === 'pdf') return IM.openPdf('receipt', p.id, (err) => IM.setMsg('dStatus', err.message, 'error'));
      if (act === 'make') return IM.Payments.issue(p, null, reload);
      if (act === 'edit') return IM.Payments.edit(p, reload);
      if (act === 'send') {
        const email = IM.Send.emailOf(customers, p.customerId);
        return IM.Send.open({ kind: 'receipt', id: p.id, no: p.receiptNo, client: p.client, email, customerHasEmail: !!email, sentTo: p.sentTo,
          onDone: (out) => { IM.setMsg('dStatus', `Receipt ${p.receiptNo} sent to ${out.sentTo}.`, 'ok'); reload(); } });
      }
    });
    load();
  });
})();
