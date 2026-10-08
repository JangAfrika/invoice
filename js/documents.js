/* The printed documents: company letterhead, invoice and receipt, and turning them into PDFs.
   Everything comes from the signed-in company's own details (name, logo, colours, terms, currency). */
(function () {
  const IM = (window.IM = window.IM || {});
  const esc = (s) => IM.esc(s);

  function stripeCss(c) {
    const cols = (c.stripeColors || []).filter(Boolean);
    if (!cols.length) return c.brandColor || 'var(--navy)';
    // equal bands with a thin white gap between them, like a flag
    const step = 100 / cols.length;
    const parts = [];
    cols.forEach((col, i) => {
      const a = (i * step).toFixed(2), b = ((i + 1) * step).toFixed(2);
      const gapEnd = i < cols.length - 1 ? (Number(b) - 0.6).toFixed(2) : b;
      parts.push(`${col} ${a}%`, `${col} ${gapEnd}%`);
      if (i < cols.length - 1) parts.push(`#fff ${gapEnd}%`, `#fff ${b}%`);
    });
    return `linear-gradient(90deg, ${parts.join(', ')})`;
  }

  IM.letterhead = function (type, metaRows, company) {
    const c = company || IM.company || {};
    const logo = IM.logoSrc ? `<img src="${esc(IM.logoSrc)}" alt="" onerror="this.remove()">` : '';
    const meta = metaRows.map((m) => `<tr><td>${esc(m[0])}</td><td>${esc(m[1])}</td></tr>`).join('');
    const contact = [c.phone, c.email, c.website].filter(Boolean).map(esc).join('<br>');
    return `
      <div class="doc-stripe" style="background:${stripeCss(c)}"></div>
      <div class="doc-head">
        <div class="doc-brand">
          ${logo}
          <div>
            <div class="name">${esc(c.name || 'Your company')}</div>
            ${c.address ? `<div class="loc">${esc(c.address)}</div>` : ''}
            ${contact ? `<div class="ct">${contact}</div>` : ''}
            ${c.taxId ? `<div class="ct">Tax ID: ${esc(c.taxId)}</div>` : ''}
          </div>
        </div>
        <div class="doc-id">
          <div class="type">${esc(type)}</div>
          <table class="doc-meta">${meta}</table>
        </div>
      </div>
      <div class="doc-rule"></div>`;
  };

  /**
   * d: { client, customer: {email, phone, address}, date, due, notes, rows: [{item, desc, qty, price, amount}], total }
   * opts: { invoiceNo, signature, issuer }
   */
  IM.renderInvoice = function (el, d, opts) {
    opts = opts || {};
    const c = IM.company || {};
    el.classList.add('invoice-doc');
    const rowsHtml = d.rows.length ? d.rows.map((r, i) => `
      <tr>
        <td class="c" style="width:40px">${IM.pad(i + 1)}</td>
        <td style="width:120px">${esc(r.item)}</td>
        <td>${esc(r.desc)}</td>
        <td class="c" style="width:56px">${esc(r.qty)}</td>
        <td class="num" style="width:106px">${IM.money(r.price)}</td>
        <td class="num" style="width:112px">${IM.money(r.amount)}</td>
      </tr>`).join('') : '<tr><td colspan="6" class="empty-row">Items you add will appear here</td></tr>';

    const services = String(c.services || '').split(/[,/\n]/).map((x) => x.trim()).filter(Boolean).map(esc).join(' &nbsp;•&nbsp; ');
    const payLines = c.paymentDetails ? `<div class="dk">Payment details</div><div>${esc(c.paymentDetails).replace(/\n/g, '<br>')}</div>` : '';
    const dueText = d.due ? IM.prettyDate(d.due) : 'On receipt';
    const cu = d.customer || {};
    const custLines = [cu.address, cu.phone, cu.email].filter(Boolean).map(esc).join('<br>');
    const sig = opts.signature;
    const issuer = opts.issuer || (IM.user && IM.user.name) || '';

    el.innerHTML = `
      ${IM.letterhead('INVOICE', [
        ['Invoice No', opts.invoiceNo || 'Assigned on generate'],
        ['Date', IM.prettyDate(d.date)],
        ['Due date', dueText]
      ])}
      ${services ? `<div class="svc">${services}</div>` : ''}
      <div class="bill">
        <div>
          <div class="dk">Bill to</div>
          <div class="who${d.client ? '' : ' ph'}">${esc(d.client || 'Client name')}</div>
          ${custLines ? `<div class="whodet">${custLines}</div>` : ''}
        </div>
        <div class="due-box">
          <div class="dk">Amount due</div>
          <div class="amt">${IM.money(d.total)}</div>
          <div class="dd">Due: ${esc(dueText)}</div>
        </div>
      </div>
      <table class="items">
        <thead><tr>
          <th class="c" style="width:40px">#</th><th style="width:120px">Item</th><th>Description</th>
          <th class="c" style="width:56px">Qty</th><th class="num" style="width:106px">Unit price</th><th class="num" style="width:112px">Amount</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="sum">
        <div class="sum-left">
          <div class="dk">Amount in words</div>
          <div class="words">${d.total > 0 ? esc(IM.amountWords(d.total)) : '—'}</div>
          ${d.notes ? `<div class="dk" style="margin-top:12px">Notes</div><div>${esc(d.notes).replace(/\n/g, '<br>')}</div>` : ''}
        </div>
        <div class="totals">
          <div class="row"><span>Sub-total</span><span>${IM.money(d.total)}</span></div>
          <div class="row grand"><span>Total due</span><span>${IM.money(d.total)}</span></div>
        </div>
      </div>
      <div class="doc-foot">
        <div class="terms">
          ${payLines}
          ${c.terms ? `<div class="dk">Terms</div><div>${esc(c.terms).replace(/\n/g, '<br>')}</div>` : ''}
        </div>
        <div class="sigs">
          <div>Issued by${issuer ? ': <b>' + esc(issuer) + '</b>' : ''}</div>
          <div>${sig ? `<span class="sig-img"><img src="${esc(sig)}" alt=""></span>` : ''}Authorised signature${sig ? `<span class="sig-date">Signed ${esc(IM.prettyDate(IM.todayISO()))}</span>` : ''}</div>
        </div>
        ${c.thanks ? `<div class="thanks">${esc(c.thanks)}</div>` : ''}
      </div>`;
  };

  // p: a payment/receipt from the server
  IM.renderReceipt = function (el, p, sig) {
    const c = IM.company || {};
    el.classList.add('receipt-doc');
    const full = p.balanceAfter <= 0.005;
    el.innerHTML = `
      ${IM.letterhead('RECEIPT', [
        ['Receipt No', p.receiptNo],
        ['Date', IM.prettyDate(p.date)],
        ['Invoice', p.invoiceNo]
      ])}
      <div class="rc-rows">
        <div class="rc-row"><div class="k2">Received from</div><div class="v">${esc(p.client)}</div></div>
        <div class="rc-row"><div class="k2">The sum of</div><div class="v">${esc(IM.amountWords(p.amount))}</div></div>
        <div class="rc-row"><div class="k2">Being payment for</div><div class="v">Invoice ${esc(p.invoiceNo)}${p.note ? ' (' + esc(p.note) + ')' : ''}</div></div>
        <div class="rc-row"><div class="k2">Payment method</div><div class="v">${esc(p.method || '—')}</div></div>
      </div>
      <div class="rc-bottom">
        <div class="rc-amount"><div class="lbl">Amount received</div><div class="big">${IM.money(p.amount)}</div></div>
        <table class="rc-sum">
          <tr><td>Invoice total</td><td>${IM.money(p.invoiceTotal)}</td></tr>
          <tr><td>Paid to date</td><td>${IM.money(p.paidToDate)}</td></tr>
          <tr><td><b>Balance</b></td><td><b>${IM.money(p.balanceAfter)}</b></td></tr>
        </table>
      </div>
      <div class="rc-stamp">${full ? '<span class="full">PAID IN FULL</span>' : '<span class="part">PART PAYMENT</span>'}</div>
      ${c.thanks ? `<div class="rc-thanks">${esc(c.thanks)}</div>` : '<div class="rc-thanks"></div>'}
      <div class="rc-sign">
        <div>Received by${p.recordedBy ? ': <b>' + esc(p.recordedBy) + '</b>' : ' (name)'}</div>
        <div>${sig ? `<span class="sig-img"><img src="${esc(sig)}" alt=""></span>` : ''}Signature${sig ? `<span class="sig-date">Signed ${esc(IM.prettyDate(IM.todayISO()))}</span>` : ''}</div>
      </div>`;
  };

  function pdfLib() {
    if (typeof html2pdf === 'undefined') throw new Error('The PDF tool could not load. Check your internet connection and reload the page.');
    return html2pdf;
  }

  IM.invoicePdf = function (el, fileName) {
    return pdfLib()().set({
      margin: 0, filename: fileName,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.sum', '.doc-foot'] }
    }).from(el).outputPdf('blob');
  };

  IM.receiptPdf = function (el) {
    return pdfLib()().set({
      margin: 0,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a5', orientation: 'landscape' }
    }).from(el).outputPdf('blob');
  };
})();
