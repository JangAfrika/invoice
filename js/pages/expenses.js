/* Expenses: list, add or edit with a receipt photo (read for you), delete. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  const Acc = IM.Acc;
  let all = [], cats = [], methods = [], settings = {};
  let editing = null;         // the expense being edited, or null for a new one
  let receipt = null;         // { fileId, sig, name, scanned } just uploaded
  let removeReceipt = false;

  function filtered() {
    const r = Acc.range($('exPeriod').value);
    const cat = $('exCat').value, q = $('exSearch').value.trim().toLowerCase();
    return all.filter((e) => e.date >= r.from && e.date <= r.to && (!cat || e.category === cat) &&
      (!q || [e.vendor, e.category, e.description, e.reference].join(' ').toLowerCase().includes(q)));
  }

  function render() {
    const list = filtered();
    const total = list.reduce((s, e) => s + e.amount, 0), tax = list.reduce((s, e) => s + e.tax, 0);
    $('exSummary').textContent = list.length ? `${list.length} expense${list.length === 1 ? '' : 's'} · ${IM.money(total)}${tax ? ' · tax included ' + IM.money(tax) : ''}` : '';
    $('exBody').innerHTML = list.length ? list.map((e) => `
      <tr data-href="expense.html?id=${encodeURIComponent(e.id)}">
        <td>${esc(IM.shortDate(e.date))}</td>
        <td><b>${IM.lnk('expense.html?id=' + encodeURIComponent(e.id), e.vendor, 'plain')}</b>${e.description ? `<span class="sub">${esc(e.description)}</span>` : ''}</td>
        <td>${esc(e.category)}${e.repeat !== 'None' ? `<span class="sub">repeats ${esc(e.repeat.toLowerCase())}</span>` : ''}</td>
        <td class="num">${IM.money(e.amount)}</td>
        <td>${e.hasReceipt ? `<button type="button" data-act="receipt" data-id="${esc(e.id)}">${IM.icon('pdf')} View</button>` : '<span class="sub">none</span>'}</td>
        <td><div class="acts"><button type="button" data-act="edit" data-id="${esc(e.id)}">Edit</button><button type="button" class="danger" data-act="delete" data-id="${esc(e.id)}">Delete</button></div></td>
      </tr>`).join('')
      : `<tr><td colspan="6" class="empty">${all.length ? 'No expenses match these filters.' : 'No expenses yet. Click Add expense and upload a receipt photo, or type the details.'}</td></tr>`;
  }

  async function load() {
    IM.setMsg('exStatus', all.length ? '' : 'Loading…');
    try {
      const d = await IM.api({ action: 'accLists', from: '2000-01-01' });
      all = d.expenses; cats = d.expenseCategories; methods = d.methods; settings = d.settings;
      const have = new Set(cats.concat(all.map((e) => e.category)));
      const keep = $('exCat').value || ($('exCat').dataset.done ? '' : IM.param('cat'));
      $('exCat').dataset.done = '1';
      $('exCat').innerHTML = '<option value="">All categories</option>' + Array.from(have).sort().map((c) => `<option>${esc(c)}</option>`).join('');
      $('exCat').value = keep;
      IM.setMsg('exStatus', '');
      render();
    } catch (err) { IM.setMsg('exStatus', err.message, 'error'); }
  }

  /* ---- add / edit dialog ---- */
  function rcNote(msg, kind) { const n = $('rcNote'); n.textContent = msg || ''; n.className = 'rc-note ' + (kind || ''); }

  function showReceiptState() {
    const has = receipt || (editing && editing.hasReceipt && !removeReceipt);
    $('rcCurrent').hidden = !has;
    $('rcCurrentName').textContent = receipt ? receipt.name : (editing ? editing.receiptName || 'Receipt attached' : '');
    $('rcView').hidden = !!receipt || !editing;
  }

  function openDialog(e) {
    editing = e || null; receipt = null; removeReceipt = false;
    $('exTitle').textContent = e ? 'Edit expense' : 'Add expense';
    $('fDate').value = e ? e.date : IM.todayISO();
    $('fDate').max = IM.todayISO();
    $('fVendor').value = e ? e.vendor : '';
    $('fAmount').value = e ? e.amount : '';
    $('fTax').value = e && e.tax ? e.tax : '';
    $('fCat').value = e ? e.category : '';
    $('catList').innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');
    $('fMethod').innerHTML = '<option value=""></option>' + Array.from(new Set(methods.concat(e && e.method ? [e.method] : []))).map((m) => `<option${e && e.method === m ? ' selected' : ''}>${esc(m)}</option>`).join('');
    $('fRepeat').value = e ? e.repeat : 'None';
    $('fRef').value = e ? e.reference : '';
    $('fDesc').value = e ? e.description : '';
    $('fScan').checked = true;
    $('fFile').value = '';
    $('exError').textContent = '';
    rcNote('');
    showReceiptState();
    $('exDialog').showModal();
  }

  const setIfEmpty = (id, v) => { if (v && !$(id).value) $(id).value = v; };

  async function onFile() {
    const file = $('fFile').files[0];
    if (!file) return;
    $('exError').textContent = '';
    $('fFile').disabled = true;
    rcNote($('fScan').checked ? 'Uploading and reading the receipt…' : 'Uploading the receipt…');
    try {
      const prep = await Acc.prepareReceipt(file);
      const out = await IM.api({ action: 'uploadReceipt', fileName: prep.fileName, mime: prep.mime, base64: prep.base64, scan: $('fScan').checked });
      receipt = { fileId: out.fileId, sig: out.sig, name: out.name, scanned: out.scanned };
      removeReceipt = false;
      const s = out.suggestion;
      if (s) {
        // suggestions fill empty boxes only, so nothing typed is overwritten
        setIfEmpty('fVendor', s.vendor); setIfEmpty('fAmount', s.total || ''); setIfEmpty('fTax', s.tax || '');
        setIfEmpty('fCat', s.category);
        if (s.date && (!editing || $('fDate').value === IM.todayISO())) $('fDate').value = s.date;
        if (s.method && !$('fMethod').value) { const o = Array.from($('fMethod').options).find((x) => x.value.toLowerCase() === s.method.toLowerCase()); if (o) $('fMethod').value = o.value; }
      }
      rcNote(out.readMessage || 'Receipt attached.', s && (s.vendor || s.total) ? 'ok' : 'warn');
      IM.track(out.scanned ? 'receipt_scanned' : 'receipt_uploaded');
      showReceiptState();
    } catch (err) { rcNote(''); $('exError').textContent = err.message; }
    $('fFile').disabled = false;
    $('fFile').value = '';
  }

  async function save(ev) {
    ev.preventDefault();
    const amount = Number($('fAmount').value);
    if ($('fVendor').value.trim().length < 2) { $('exError').textContent = 'Enter who was paid (the vendor).'; return; }
    if (!(amount > 0)) { $('exError').textContent = 'Enter the amount paid.'; return; }
    if (!$('fDate').value) { $('exError').textContent = 'Choose the date.'; return; }
    $('exSave').disabled = true;
    try {
      const out = await IM.api({ action: 'saveExpense', expense: {
        id: editing ? editing.id : '', vendor: $('fVendor').value.trim(), date: $('fDate').value, amount, tax: Number($('fTax').value) || 0,
        category: $('fCat').value.trim(), method: $('fMethod').value, repeat: $('fRepeat').value, reference: $('fRef').value.trim(),
        description: $('fDesc').value.trim(), receipt: receipt || undefined, removeReceipt
      } });
      IM.track(editing ? 'expense_updated' : 'expense_added', { scanned: !!(receipt && receipt.scanned) });
      $('exDialog').close();
      await load();
      IM.setMsg('exStatus', (editing ? 'Expense updated.' : 'Expense saved.') + ' ' + out.expense.vendor + ' ' + IM.money(out.expense.amount), 'ok');
    } catch (err) { $('exError').textContent = err.message; }
    $('exSave').disabled = false;
  }

  IM.boot({ page: 'expenses', fin: true }).then(() => {
    $('exPeriod').innerHTML = Acc.periodOptions('year');
    ['exPeriod', 'exCat'].forEach((id) => $(id).addEventListener('change', render));
    $('exSearch').addEventListener('input', render);
    $('addBtn').addEventListener('click', () => openDialog(null));
    $('exCancel').addEventListener('click', () => $('exDialog').close());
    $('exForm').addEventListener('submit', save);
    $('fFile').addEventListener('change', onFile);
    $('rcRemove').addEventListener('click', () => {
      if (receipt) receipt = null; else removeReceipt = true;
      rcNote('The receipt will be removed when you save.', 'warn');
      showReceiptState();
    });
    $('rcView').addEventListener('click', () => editing && Acc.openReceipt(editing.id, (err) => { $('exError').textContent = err.message; }));
    IM.clickable($('exBody'));
    $('exBody').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const ex = all.find((x) => x.id === b.dataset.id);
      if (!ex) return;
      if (b.dataset.act === 'edit') return openDialog(ex);
      if (b.dataset.act === 'receipt') return Acc.openReceipt(ex.id, (err) => IM.setMsg('exStatus', err.message, 'error'));
      if (b.dataset.act === 'delete') {
        if (!await IM.confirm({ title: 'Delete expense?', message: `Delete the ${IM.money(ex.amount)} expense paid to ${ex.vendor} on ${IM.shortDate(ex.date)}.`,
          detail: ex.hasReceipt ? 'Its receipt file is deleted too. This cannot be undone.' : 'This cannot be undone.', confirmText: 'Delete', danger: true })) return;
        try {
          await IM.api({ action: 'deleteExpense', id: ex.id });
          IM.track('expense_deleted');
          await load();
          IM.setMsg('exStatus', 'Expense deleted.', 'ok');
        } catch (err) { IM.setMsg('exStatus', err.message, 'error'); }
      }
    });
    if (IM.param('q')) $('exSearch').value = IM.param('q');
    load().then(() => {
      if (IM.param('add')) openDialog(null);
      const o = IM.param('open') && all.find((x) => x.id === IM.param('open'));
      if (o) openDialog(o);
    });
  });
})();
