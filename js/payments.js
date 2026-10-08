/* Recording payments and issuing signed receipts (used on the Invoices and Receipts pages).
   IM.Payments.record(invoice, onDone), IM.Payments.edit(payment, onDone), IM.Payments.issue(payment, signature, onDone) */
(function () {
  const IM = (window.IM = window.IM || {});
  const $ = (id) => document.getElementById(id);
  let ready = false;
  let ctx = { invoice: null, payment: null, onDone: null };
  let rc = { p: null, blob: null, name: '', onDone: null };

  const HTML = `
  <dialog id="payDialog">
    <div class="dlg">
      <h3 id="payTitle">Record payment</h3>
      <div class="info" id="payInfo"></div>
      <label>Amount received <input id="payAmount" type="number" min="0" step="any" inputmode="decimal"></label>
      <div class="two">
        <label>Payment date <input id="payDate" type="date"></label>
        <label>Method <select id="payMethod"></select></label>
      </div>
      <label>Note (optional) <input id="payNote" type="text" maxlength="300" placeholder="e.g. reference number"></label>
      <div class="err" id="payError"></div>
      <div class="btns">
        <button type="button" id="payCancel">Cancel</button>
        <button type="button" class="primary" id="paySave">Sign &amp; issue receipt</button>
      </div>
    </div>
  </dialog>
  <dialog id="rcDialog">
    <div class="dlg">
      <h3 id="rcTitle">Receipt</h3>
      <div class="info" id="rcInfo"></div>
      <div id="rcStatus" role="status"></div>
      <div class="btns" id="rcBtns" hidden>
        <button type="button" id="rcSend" hidden>Send email</button>
        <button type="button" id="rcDownload">Download</button>
        <button type="button" id="rcOpen">Print</button>
        <button type="button" class="primary" id="rcClose">Done</button>
      </div>
      <div class="btns" id="rcBtnsBusy" hidden><button type="button" id="rcCloseBusy">Close</button></div>
    </div>
  </dialog>
  <div id="receiptHost"><div id="receiptDoc"></div></div>`;

  function fillMethods(selected) {
    const list = (IM.company && IM.company.paymentMethods && IM.company.paymentMethods.length) ? IM.company.paymentMethods : ['Cash', 'Bank transfer', 'Other'];
    const opts = list.slice();
    if (selected && opts.indexOf(selected) < 0) opts.push(selected);
    $('payMethod').innerHTML = opts.map((m) => `<option${m === selected ? ' selected' : ''}>${IM.esc(m)}</option>`).join('');
  }

  function setRc(msg, type) { const el = $('rcStatus'); el.textContent = msg || ''; el.className = type || ''; }

  function closeRc() {
    $('rcDialog').close();
    const cb = rc.onDone;
    rc.onDone = null;
    if (cb) cb();
  }

  function init() {
    if (ready) return;
    ready = true;
    document.body.insertAdjacentHTML('beforeend', HTML);
    $('payCancel').addEventListener('click', () => $('payDialog').close());
    $('paySave').addEventListener('click', save);
    $('rcClose').addEventListener('click', closeRc);
    $('rcCloseBusy').addEventListener('click', closeRc);
    $('rcDownload').addEventListener('click', () => { if (rc.blob) { IM.downloadBlob(rc.blob, rc.name); IM.track('receipt_downloaded'); } });
    $('rcOpen').addEventListener('click', () => { if (rc.blob) { IM.track('receipt_printed'); window.open(URL.createObjectURL(rc.blob), '_blank'); } });
    $('rcSend').addEventListener('click', () => {
      const p = rc.p;
      if (!p || !IM.Send) return;
      const email = IM.Send.emailOf(IM.customers, p.customerId);
      const after = rc.onDone;
      closeRc();
      IM.Send.open({ kind: 'receipt', id: p.id, no: p.receiptNo, client: p.client, email, customerHasEmail: !!email,
        onDone: () => { IM.track('receipt_emailed'); if (after) after(); } });
    });
  }

  async function save() {
    const amount = Number($('payAmount').value);
    if (!(amount > 0)) { $('payError').textContent = 'Enter the amount received.'; return; }
    if (!$('payDate').value) { $('payError').textContent = 'Choose the payment date.'; return; }
    const editing = ctx.payment;

    // a receipt cannot be issued, edited or downloaded until it is signed
    const sig = await IM.getSignature(editing ? `Sign changes to receipt ${editing.receiptNo}` : 'Sign to issue the receipt');
    if (!sig) { $('payError').textContent = editing ? 'No changes were saved. It has to be signed to confirm them.' : 'The receipt has to be signed before it is issued.'; return; }

    const btn = $('paySave');
    btn.disabled = true;
    $('payError').textContent = '';
    const data = { amount, date: $('payDate').value, method: $('payMethod').value, note: $('payNote').value.trim() };
    try {
      const out = editing
        ? await IM.api(Object.assign({ action: 'updatePayment', paymentId: editing.id }, data))
        : await IM.api(Object.assign({ action: 'recordPayment', invoiceId: ctx.invoice.id }, data));
      IM.dropList();
      $('payDialog').close();
      IM.Payments.issue(out.receipt, sig, ctx.onDone);
    } catch (err) {
      $('payError').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  }

  IM.Payments = {
    record(inv, onDone) {
      init();
      ctx = { invoice: inv, payment: null, onDone };
      $('payTitle').textContent = `Record payment for ${inv.no}`;
      $('payInfo').textContent = `${inv.client} · Total ${IM.money(inv.total)} · Paid ${IM.money(inv.paid)} · Balance ${IM.money(inv.balance)}`;
      $('payAmount').value = inv.balance;
      $('payDate').value = IM.todayISO();
      fillMethods('');
      $('payNote').value = '';
      $('payError').textContent = '';
      $('paySave').textContent = 'Sign & issue receipt';
      $('payDialog').showModal();
    },

    edit(p, onDone) {
      init();
      if (!IM.withinEditWindow(p.recordedAt)) return;
      ctx = { invoice: null, payment: p, onDone };
      $('payTitle').textContent = `Edit receipt ${p.receiptNo}`;
      $('payInfo').textContent = `${p.client} · Invoice ${p.invoiceNo} · Invoice total ${IM.money(p.invoiceTotal)}`;
      $('payAmount').value = p.amount;
      $('payDate').value = p.date;
      fillMethods(p.method);
      $('payNote').value = p.note || '';
      $('payError').textContent = '';
      $('paySave').textContent = 'Sign & save changes';
      $('payDialog').showModal();
    },

    // builds the signed receipt PDF (nothing downloads by itself) and saves a copy to the company's Drive folder
    async issue(p, sig, onDone) {
      init();
      if (!sig) {
        sig = await IM.getSignature('Sign receipt ' + p.receiptNo);
        if (!sig) return;
      }
      if (!IM.logoSrc) await IM.loadLogo();
      rc = { p, blob: null, name: IM.safeName(`Receipt ${p.receiptNo} - ${p.client}.pdf`), onDone };
      $('rcTitle').textContent = `Receipt ${p.receiptNo}`;
      $('rcInfo').textContent = `${p.client} · ${IM.money(p.amount)} for invoice ${p.invoiceNo}`;
      $('rcBtns').hidden = true;
      $('rcSend').hidden = true;
      $('rcBtnsBusy').hidden = false;
      setRc('Creating the signed receipt PDF…');
      if (!$('rcDialog').open) $('rcDialog').showModal();

      try {
        IM.renderReceipt($('receiptDoc'), p, sig);
        rc.blob = await IM.receiptPdf($('receiptDoc'));
        $('rcBtns').hidden = false;
        $('rcBtnsBusy').hidden = true;
        setRc('Saving a copy…');
        try {
          await IM.api({ action: 'saveReceiptPdf', paymentId: p.id, fileName: rc.name, pdfBase64: await IM.blobToBase64(rc.blob), signed: true });
          IM.dropList();
          IM.track('receipt_issued');
          setRc('Receipt is ready and saved. Send it by email, download it or print it.', 'ok');
          $('rcSend').hidden = !IM.Send;
        } catch (err) {
          setRc('Receipt signed, but saving a copy failed: ' + err.message, 'error');
        }
      } catch (err) {
        setRc(err.message, 'error');
      }
    }
  };
})();
