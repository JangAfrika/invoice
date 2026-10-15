/* One expense in full: who was paid, how much, the receipt itself, and other expenses to the same vendor. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  const Acc = IM.Acc;
  const id = IM.param('id');
  let all = [];
  const kv = (rows) => `<dl class="kv">${rows.filter((r) => r[1] !== '' && r[1] != null).map((r) => `<dt>${esc(r[0])}</dt><dd>${r[2] ? r[1] : esc(r[1])}</dd>`).join('')}</dl>`;

  async function showReceipt(e) {
    const box = $('rcBox');
    if (!box) return;
    try {
      const out = await IM.api({ action: 'getExpenseReceipt', id: e.id });
      const blob = IM.base64ToBlob(out.base64, out.mime || 'application/octet-stream');
      const url = URL.createObjectURL(blob);
      box.innerHTML = /^image\//.test(out.mime) ? `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Receipt" style="max-width:100%;max-height:560px;border:1px solid var(--line);border-radius:4px"></a>`
        : `<iframe src="${url}" title="Receipt" style="width:100%;height:560px;border:1px solid var(--line);border-radius:4px"></iframe>`;
      $('rcDown').hidden = false;
      $('rcDown').onclick = () => IM.downloadBlob(blob, out.fileName);
    } catch (err) { box.innerHTML = `<div class="msg error">${esc(err.message)}</div>`; }
  }

  function render(e) {
    const same = all.filter((x) => x.id !== e.id && x.vendor.trim().toLowerCase() === e.vendor.trim().toLowerCase()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    const vendorTotal = same.reduce((s, x) => s + x.amount, e.amount);
    document.title = e.vendor + ' · Invoice Manager';
    $('dTitle').textContent = e.vendor;
    $('dCrumbs').innerHTML = `<a href="expenses.html">Expenses</a> › ${esc(e.vendor)}`;
    $('dActions').innerHTML = `<a class="btn" href="expenses.html?open=${encodeURIComponent(e.id)}">Edit</a><button type="button" class="danger" id="delBtn">Delete</button>`;
    $('dBody').innerHTML = `
      <div class="cards">
        <div class="card red"><div class="k">Amount paid</div><div class="v">${IM.money(e.amount)}</div><div class="s">${esc(IM.prettyDate(e.date))}</div></div>
        <div class="card"><div class="k">Tax included</div><div class="v">${e.tax ? IM.money(e.tax) : '—'}</div><div class="s">${e.tax ? IM.pct(e.tax, e.amount) + ' of the amount' : 'none recorded'}</div></div>
        <a class="card" href="${esc(Acc.url('expenses.html', { cat: e.category }))}"><div class="k">Category</div><div class="v" style="font-size:15px">${esc(e.category)}</div><div class="s">see all in this category</div></a>
      </div>
      <div class="dgrid">
        <div class="dpanel"><h3>Expense details</h3>${kv([
          ['Paid to', e.vendor], ['Date', IM.prettyDate(e.date)], ['Category', e.category], ['Payment method', e.method],
          ['Repeats', e.repeat && e.repeat !== 'None' ? e.repeat : ''], ['Reference', e.reference], ['Description', e.description],
          ['Entered', e.source === 'Scanned' ? 'From a scanned receipt' : 'Typed in'], ['Recorded by', e.by]
        ])}</div>
        <div class="dpanel"><h3>Same vendor</h3><div class="s" style="font-size:12.5px;margin-bottom:6px">${same.length + 1} expense${same.length ? 's' : ''} to ${esc(e.vendor)}, ${IM.money(vendorTotal)} in total.</div>
          ${same.length ? `<div class="tablewrap"><table class="inv"><tbody>${same.map((x) => `<tr><td>${IM.lnk('expense.html?id=' + encodeURIComponent(x.id), IM.shortDate(x.date), 'plain')}</td><td>${esc(x.category)}</td><td class="num">${IM.money(x.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<span class="sub">No other expenses to this vendor.</span>'}
          <p style="margin:10px 0 0;font-size:12.5px"><a class="lnk" href="${esc(Acc.url('expenses.html', { q: e.vendor }))}">All expenses to ${esc(e.vendor)}</a></p></div>
        <div class="dpanel wide"><h3>Receipt <button type="button" id="rcDown" hidden style="float:right">Download</button></h3>
          ${e.hasReceipt ? '<div id="rcBox"><span class="sub">Loading the receipt…</span></div>' : '<span class="sub">No receipt was kept for this expense. <a class="lnk" href="expenses.html?open=' + encodeURIComponent(e.id) + '">Edit it to attach one.</a></span>'}</div>
      </div>`;
    if (e.hasReceipt) showReceipt(e);
    $('delBtn').addEventListener('click', async () => {
      if (!await IM.confirm({ title: 'Delete expense?', message: `Delete the ${IM.money(e.amount)} expense paid to ${e.vendor} on ${IM.shortDate(e.date)}.`, detail: e.hasReceipt ? 'Its receipt file is deleted too. This cannot be undone.' : 'This cannot be undone.', confirmText: 'Delete', danger: true })) return;
      try { await IM.api({ action: 'deleteExpense', id: e.id }); IM.track('expense_deleted'); location.href = 'expenses.html'; }
      catch (err) { IM.setMsg('dStatus', err.message, 'error'); }
    });
  }

  IM.boot({ page: 'expenses', fin: true }).then(async () => {
    IM.setMsg('dStatus', 'Loading…');
    try {
      all = (await IM.api({ action: 'accLists', from: '2000-01-01' })).expenses;
      const e = all.find((x) => x.id === id);
      if (!e) { IM.setMsg('dStatus', 'That expense was not found. It may have been deleted.', 'error'); $('dBody').innerHTML = '<p><a class="lnk" href="expenses.html">Back to expenses</a></p>'; return; }
      IM.setMsg('dStatus', '');
      render(e);
    } catch (err) { IM.setMsg('dStatus', err.message, 'error'); }
  });
})();
