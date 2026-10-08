/* New invoice (and editing an unpaid invoice within the edit window: invoice-new.html?edit=<id>). */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  let items = [];
  let customers = [];
  let editing = null;        // the invoice being edited
  let lastGen = null;        // { invoice, data, signature, fileName, wasEdit }
  let lastBlob = null;
  let lastSaved = false;     // the signed PDF is saved, so it can be emailed

  const newItem = () => ({ item: '', desc: '', qty: 1, price: 0 });
  const setStatus = (msg, type) => { const el = $('status'); el.textContent = msg || ''; el.className = type || ''; };

  /* ---- customers ---- */
  function findCustomer(name) {
    const k = String(name || '').trim().toLowerCase();
    return k ? customers.find((c) => c.name.trim().toLowerCase() === k) || null : null;
  }
  function fillCustomerList() {
    $('custList').innerHTML = customers.filter((c) => c.active).map((c) => `<option value="${esc(c.name)}">`).join('');
  }
  function showCustomerInfo() {
    const c = findCustomer($('client').value);
    const bits = c ? [c.phone, c.email, c.address].filter(Boolean) : [];
    $('custInfo').textContent = !$('client').value.trim() ? '' : c ? (bits.length ? bits.join(' · ') : 'Existing customer') : 'New customer: saved to Customers when the invoice is created.';
  }

  /* ---- item rows ---- */
  function drawItems() {
    $('items').innerHTML = items.map((it, i) => `
      <div class="item">
        <div class="two">
          <label>Item<input data-k="item" data-i="${i}" value="${esc(it.item)}" maxlength="120" placeholder="e.g. Service"></label>
          <label>Description<input data-k="desc" data-i="${i}" value="${esc(it.desc)}" maxlength="500" placeholder="e.g. Installation"></label>
        </div>
        <div class="two">
          <label>Qty<input data-k="qty" data-i="${i}" type="number" min="0" step="any" inputmode="decimal" value="${esc(it.qty)}"></label>
          <label>Unit price<input data-k="price" data-i="${i}" type="number" min="0" step="any" inputmode="decimal" value="${esc(it.price)}"></label>
        </div>
        ${items.length > 1 ? `<button type="button" class="remove" data-remove="${i}">Remove item</button>` : ''}
      </div>`).join('');
  }

  const round2 = (n) => Math.round(n * 100) / 100;
  function getData() {
    const rows = items.filter((r) => String(r.item).trim() || String(r.desc).trim()).map((r) => {
      const qty = Number(r.qty) || 0;
      const price = round2(Number(r.price) || 0);
      return { item: String(r.item).trim(), desc: String(r.desc).trim(), qty, price, amount: round2(qty * price) };
    });
    const c = findCustomer($('client').value);
    return {
      client: $('client').value.trim(),
      customer: c ? { email: c.email, phone: c.phone, address: c.address } : null,
      customerId: c ? c.id : '',
      date: $('date').value, due: $('due').value, notes: $('notes').value.trim(),
      rows, total: round2(rows.reduce((s, r) => s + r.amount, 0))
    };
  }

  function refresh() {
    $('totalLabel').textContent = IM.money(getData().total);
    IM.renderInvoice($('invoice'), getData(), { invoiceNo: editing ? editing.no : '' });
  }

  /* ---- generate ---- */
  async function generate() {
    const d = getData();
    if (!d.client) return setStatus('Enter the customer name.', 'error');
    if (!d.date) return setStatus('Choose the invoice date.', 'error');
    if (!d.rows.length) return setStatus('Add at least one item.', 'error');
    if (!(d.total > 0)) return setStatus('The total must be greater than 0.', 'error');
    if (d.rows.some((r) => r.qty < 0 || r.price < 0)) return setStatus('Quantities and prices cannot be negative.', 'error');
    if (d.due && d.due < d.date) return setStatus('The due date is before the invoice date.', 'error');

    const btn = $('generate');
    btn.disabled = true;
    $('result').classList.remove('show');
    lastBlob = null;
    lastGen = null;
    try {
      // an invoice cannot be created, edited or downloaded until it is signed
      setStatus(editing ? 'Sign to save your changes…' : 'Sign the invoice to continue…');
      const sig = await IM.getSignature(editing ? `Sign changes to ${editing.no}` : 'Sign to create this invoice');
      if (!sig) return setStatus(editing ? 'No changes were saved. It has to be signed to confirm them.' : 'The invoice was not created. It has to be signed first.', 'error');

      const payload = { client: d.client, customerId: d.customerId, date: d.date, dueDate: d.due, notes: d.notes, items: d.rows };
      setStatus(editing ? 'Saving your changes…' : 'Getting the invoice number…');
      const out = editing
        ? await IM.api(Object.assign({ action: 'updateInvoice', invoiceId: editing.id }, payload))
        : await IM.api(Object.assign({ action: 'createInvoice' }, payload));
      IM.dropList();

      // print exactly what the server saved
      d.rows = out.lines.map((r) => ({ item: r.item, desc: r.desc, qty: r.qty, price: r.price, amount: r.amount }));
      d.total = out.invoice.total;
      lastGen = {
        invoice: out.invoice, data: d, signature: sig, wasEdit: !!editing,
        fileName: IM.safeName(`Invoice ${out.invoice.no} - ${d.client}${editing ? ' (revised)' : ''}.pdf`)
      };
      if (!customers.some((c) => c.id === out.invoice.customerId)) {
        customers.push({ id: out.invoice.customerId, name: d.client, active: true, email: '', phone: '', address: '' });
        fillCustomerList();
      }
      await finishInvoice();
    } catch (err) {
      setStatus(err.message, 'error');
      if (lastGen && !lastBlob) showResult(true);   // saved, but the PDF failed: retry without signing again
    } finally {
      btn.disabled = false;
    }
  }

  function showResult(retry) {
    $('retryBtn').hidden = !retry;
    $('downloadBtn').hidden = retry;
    $('printBtn').hidden = retry;
    $('sendBtn').hidden = retry || !lastSaved;
    $('result').classList.add('show');
  }

  // builds the signed PDF and saves a copy. Nothing downloads by itself: the ready panel offers Send, Download, Print.
  async function finishInvoice() {
    const g = lastGen;
    IM.renderInvoice($('invoice'), g.data, { invoiceNo: g.invoice.no, signature: g.signature });
    setStatus('Creating the signed PDF…');
    lastBlob = await IM.invoicePdf($('invoice'), g.fileName);
    setStatus('Saving a copy…');
    lastSaved = false;
    try {
      await IM.api({ action: 'saveInvoicePdf', invoiceId: g.invoice.id, fileName: g.fileName, pdfBase64: await IM.blobToBase64(lastBlob), signed: true });
      IM.dropList();
      lastSaved = true;
      setStatus(g.wasEdit
        ? `${g.invoice.no} updated and re-signed. The revised PDF is saved.`
        : `${g.invoice.no} is ready. It is saved and listed as Unpaid under Invoices.`, 'ok');
    } catch (err) {
      setStatus(`${g.invoice.no} signed, but saving a copy failed: ${err.message}`, 'error');
    }
    if (g.wasEdit) exitEditMode();
    IM.track(g.wasEdit ? 'invoice_updated' : 'invoice_created', { value: Number(g.invoice.total) || 0 });
    showResult(false);
    $('result').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* ---- edit mode ---- */
  function exitEditMode() {
    editing = null;
    $('editBanner').hidden = true;
    $('generate').textContent = 'Sign & generate invoice';
    document.title = 'New invoice · Invoice Manager';
    if (IM.param('edit')) history.replaceState(null, '', 'invoice-new.html');
  }

  async function enterEditMode(id) {
    setStatus('Loading the invoice…');
    try {
      const out = await IM.api({ action: 'invoiceItems', invoiceId: id });
      const inv = out.invoice;
      if (inv.status !== 'Unpaid' || inv.paid > 0.005 || !IM.withinEditWindow(inv.createdAt)) {
        setStatus(`${inv.no} can no longer be edited (only unpaid invoices, within ${window.APP_CONFIG.EDIT_HOURS} hours of creation).`, 'error');
        return;
      }
      editing = inv;
      items = out.lines.length ? out.lines.map((r) => ({ item: r.item, desc: r.desc, qty: r.qty, price: r.price })) : [newItem()];
      $('client').value = inv.client;
      $('date').value = inv.date;
      $('due').value = inv.due || '';
      $('notes').value = inv.notes || '';
      $('editBanner').hidden = false;
      $('editBannerNo').textContent = inv.no;
      $('generate').textContent = 'Sign & save changes';
      document.title = 'Edit ' + inv.no + ' · Invoice Manager';
      drawItems();
      showCustomerInfo();
      refresh();
      setStatus('');
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  function resetForm() {
    $('client').value = '';
    $('date').value = IM.todayISO();
    $('due').value = '';
    $('notes').value = '';
    items = [newItem()];
    lastBlob = null; lastGen = null;
    $('result').classList.remove('show');
    $('retryBtn').hidden = true;
    setStatus('');
    drawItems();
    showCustomerInfo();
    refresh();
    $('client').focus();
  }

  IM.boot({ page: 'invoice-new' }).then(() => {
    $('date').value = IM.todayISO();
    items = [newItem()];
    drawItems();
    refresh();

    $('items').addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      items[Number(e.target.dataset.i)][k] = e.target.value;
      refresh();
    });
    $('items').addEventListener('click', (e) => {
      if (e.target.dataset.remove === undefined) return;
      items.splice(Number(e.target.dataset.remove), 1);
      drawItems();
      refresh();
    });
    $('addItem').addEventListener('click', () => { items.push(newItem()); drawItems(); refresh(); });
    $('client').addEventListener('input', () => { showCustomerInfo(); refresh(); });
    ['date', 'due', 'notes'].forEach((id) => $(id).addEventListener('input', refresh));
    $('generate').addEventListener('click', generate);
    $('downloadBtn').addEventListener('click', () => { if (lastBlob) { IM.downloadBlob(lastBlob, lastGen.fileName); IM.track('invoice_downloaded'); } });
    $('printBtn').addEventListener('click', () => {
      if (!lastGen || !lastBlob) return;   // only a signed invoice can be printed
      IM.renderInvoice($('invoice'), lastGen.data, { invoiceNo: lastGen.invoice.no, signature: lastGen.signature });
      IM.track('invoice_printed');
      window.print();
    });
    $('retryBtn').addEventListener('click', async () => {
      if (!lastGen) return;
      $('retryBtn').disabled = true;
      try { await finishInvoice(); } catch (err) { setStatus(err.message, 'error'); showResult(true); }
      $('retryBtn').disabled = false;
    });
    $('newBtn').addEventListener('click', () => { exitEditMode(); resetForm(); });
    $('sendBtn').addEventListener('click', () => {
      if (!lastGen || !lastSaved) return;
      const inv = lastGen.invoice;
      const c = customers.find((x) => x.id === inv.customerId) || findCustomer(inv.client);
      const email = c && c.email ? c.email : '';
      IM.Send.open({ kind: 'invoice', id: inv.id, no: inv.no, client: inv.client, email, customerHasEmail: !!email,
        balance: inv.balance != null ? inv.balance : inv.total, due: inv.due,
        onDone: (out) => { IM.track('invoice_emailed'); setStatus(`${inv.no} sent to ${out.sentTo}.`, 'ok'); } });
    });
    $('editCancelBtn').addEventListener('click', () => { exitEditMode(); resetForm(); });

    // the logo and company details can arrive after the first drawing
    document.addEventListener('im:logo', () => { if (!lastGen) refresh(); });
    document.addEventListener('im:company', () => { if (!lastGen) refresh(); });

    IM.loadList((data) => {
      customers = data.customers;
      fillCustomerList();
      const pre = IM.param('customer') && customers.find((c) => c.id === IM.param('customer'));
      if (pre && !editing && !$('client').value) $('client').value = pre.name;
      showCustomerInfo();
      if (!lastGen) refresh();
    }).catch(() => { /* the form still works without the customer list */ });

    if (IM.param('edit')) enterEditMode(IM.param('edit'));
    else $('client').focus();
  });
})();
