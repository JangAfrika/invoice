/* Receipts: every payment received, sign unsigned ones, edit the latest one (within the edit window), open PDFs. */
(function () {
  const IM = window.IM;
  const { $, esc, sum } = IM;
  let payments = [];
  let customers = [];
  let view = IM.view.get('receipts');

  // only the most recent payment on each invoice can be edited
  function latestPerInvoice() {
    const latest = {};
    const rank = (x) => (x.recordedAt ? new Date(x.recordedAt).getTime() : IM.numOf(x.receiptNo));
    payments.forEach((p) => { const cur = latest[p.invoiceId]; if (!cur || rank(p) > rank(cur)) latest[p.invoiceId] = p; });
    return new Set(Object.values(latest).map((p) => p.id));
  }

  function render() {
    const monthKey = IM.todayISO().slice(0, 7);
    const thisMonth = payments.filter((p) => p.date && p.date.slice(0, 7) === monthKey);
    const unsigned = payments.filter((p) => !p.signed).length;

    $('rCount').textContent = payments.length;
    $('rCountS').textContent = unsigned ? unsigned + ' not signed yet' : 'all signed';
    $('rTotal').textContent = IM.money(sum(payments, 'amount'));
    $('rTotalS').textContent = 'across ' + new Set(payments.map((p) => p.invoiceId)).size + ' invoices';
    $('rMonth').textContent = IM.money(sum(thisMonth, 'amount'));
    $('rMonthS').textContent = thisMonth.length + ' payment' + (thisMonth.length === 1 ? '' : 's');

    const latest = latestPerInvoice();
    const q = $('rSearch').value.trim().toLowerCase();
    const list = payments
      .filter((p) => !q || p.receiptNo.toLowerCase().includes(q) || p.invoiceNo.toLowerCase().includes(q) || p.client.toLowerCase().includes(q))
      .sort((a, b) => (b.recordedAt || '').localeCompare(a.recordedAt || '') || IM.numOf(b.receiptNo) - IM.numOf(a.receiptNo));

    $('tableView').hidden = view !== 'list';
    $('gridView').hidden = view !== 'grid';
    const none = payments.length ? 'No receipts match your search.' : 'No receipts yet. Record a payment under <a href="invoices.html">Invoices</a> to issue one.';
    if (!list.length) {
      $('rcBody').innerHTML = `<tr><td colspan="7" class="empty">${none}</td></tr>`;
      $('gridView').innerHTML = `<div class="empty-state">${IM.icon('receipt')}<div>${none}</div></div>`;
      return;
    }
    if (view === 'grid') { $('gridView').innerHTML = list.map((p) => card(p, latest)).join(''); return; }
    $('rcBody').innerHTML = list.map((p) => {
      const canEdit = latest.has(p.id) && IM.withinEditWindow(p.recordedAt);
      return `
        <tr>
          <td><b>${esc(p.receiptNo)}</b><span class="sub">${esc(IM.shortDate(p.date))}${p.signed ? ' · signed' : ''}</span></td>
          <td>${esc(p.invoiceNo)}</td>
          <td class="wrap">${esc(p.client)}${p.note ? `<span class="sub">${esc(p.note)}</span>` : ''}</td>
          <td class="num">${IM.money(p.amount)}</td>
          <td class="num">${IM.money(p.balanceAfter)}${p.balanceAfter <= 0.005 ? '<span class="sub">paid in full</span>' : ''}</td>
          <td>${esc(p.method || '—')}</td>
          <td><div class="acts">
            ${p.hasPdf ? `<button type="button" data-act="pdf" data-id="${esc(p.id)}">PDF</button>` : ''}
            ${p.hasPdf ? `<button type="button" data-act="send" data-id="${esc(p.id)}" title="${p.sentTo ? 'Last sent to ' + esc(p.sentTo) : 'Email it to the client'}">${p.sentAt ? 'Send again' : 'Send'}</button>` : ''}
            ${p.signed ? '' : `<button type="button" class="pay" data-act="make" data-id="${esc(p.id)}">Sign &amp; create PDF</button>`}
            ${canEdit ? `<button type="button" data-act="edit" data-id="${esc(p.id)}">Edit</button>` : ''}
          </div></td>
        </tr>`;
    }).join('');
  }

  function card(p, latest) {
    const canEdit = latest.has(p.id) && IM.withinEditWindow(p.recordedAt);
    const main = !p.signed ? `<button type="button" class="primary-act pay" data-act="make" data-id="${esc(p.id)}">Sign &amp; create PDF</button>`
      : (p.hasPdf ? `<button type="button" class="primary-act" data-act="send" data-id="${esc(p.id)}">${p.sentAt ? 'Send again' : 'Send'}</button>` : '');
    const menu = [
      p.hasPdf ? `<button type="button" data-act="pdf" data-id="${esc(p.id)}">Open PDF</button>` : '',
      canEdit ? `<button type="button" data-act="edit" data-id="${esc(p.id)}">Edit</button>` : '',
      `<a href="invoices.html?q=${encodeURIComponent(p.invoiceNo)}">Invoice ${esc(p.invoiceNo)}</a>`
    ].join('');
    return `
      <article class="doccard">
        <div class="thumb">
          ${p.sentAt ? `<span class="sentflag" title="${esc(p.sentTo)}">Sent ${esc(IM.shortDate(p.sentAt.slice(0, 10)))}</span>` : ''}
          <span class="badge pill ${p.balanceAfter <= 0.005 ? 'paid' : 'partial'}">${p.balanceAfter <= 0.005 ? 'Paid in full' : 'Part payment'}</span>
          <div class="paper"><i class="b"></i><i></i><i class="s"></i><i></i><i class="s"></i></div>
        </div>
        <div class="body">
          <div class="who" title="${esc(p.client)}">${esc(p.client)}</div>
          <div class="row"><span>${esc(p.receiptNo)} · ${esc(p.invoiceNo)}</span><span>${esc(IM.shortDate(p.date))}</span></div>
          <div class="row"><span>${esc(p.method || '—')}</span><span>${p.signed ? 'Signed' : 'Not signed'}</span></div>
          <div class="row amt"><span>Received <b>${IM.money(p.amount)}</b></span>${p.balanceAfter > 0.005 ? `<span>Left <b>${IM.money(p.balanceAfter)}</b></span>` : ''}</div>
        </div>
        <div class="foot">
          <div class="more"><button type="button" data-act="more">More actions ${IM.icon('chevron')}</button><div class="menu" hidden>${menu}</div></div>
          ${main}
        </div>
      </article>`;
  }

  async function load() {
    IM.setMsg('receiptsStatus', 'Loading…');
    try {
      await IM.loadList((data, cached) => {
        payments = data.payments; customers = data.customers;
        render();
        IM.setMsg('receiptsStatus', cached ? 'Updating…' : '');
      });
      IM.setMsg('receiptsStatus', '');
    } catch (err) {
      IM.setMsg('receiptsStatus', err.message, 'error');
    }
  }

  IM.boot({ page: 'receipts' }).then(() => {
    $('rSearch').addEventListener('input', render);
    $('reloadBtn').addEventListener('click', load);
    IM.view.wire('viewToggle', 'receipts', (v) => { view = v; render(); });
    const onAct = (e) => {
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
      const p = payments.find((x) => x.id === btn.dataset.id);
      if (!p) return;
      if (act === 'send') {
        const email = IM.Send.emailOf(customers, p.customerId);
        return IM.Send.open({ kind: 'receipt', id: p.id, no: p.receiptNo, client: p.client, email, customerHasEmail: !!email, sentTo: p.sentTo,
          onDone: (out) => { IM.setMsg('receiptsStatus', `Receipt ${p.receiptNo} sent to ${out.sentTo}.`, 'ok'); load(); } });
      }
      if (act === 'pdf') return IM.openPdf('receipt', p.id, (err) => IM.setMsg('receiptsStatus', err.message, 'error'));
      if (act === 'make') return IM.Payments.issue(p, null, load);    // asks for the signature first
      if (act === 'edit') return IM.Payments.edit(p, load);
    };
    $('rcBody').addEventListener('click', onAct);
    $('gridView').addEventListener('click', onAct);
    document.addEventListener('click', (e) => { if (!e.target.closest('.more')) document.querySelectorAll('.doccard .menu').forEach((m) => { m.hidden = true; }); });
    load();
  });
})();
