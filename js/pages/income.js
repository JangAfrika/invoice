/* One other-income entry in full, with the rest of the income from the same source. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  const Acc = IM.Acc;
  const id = IM.param('id');
  let all = [];
  const kv = (rows) => `<dl class="kv">${rows.filter((r) => r[1] !== '' && r[1] != null).map((r) => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>`;

  function render(e) {
    const same = all.filter((x) => x.id !== e.id && x.source.trim().toLowerCase() === e.source.trim().toLowerCase()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    const total = same.reduce((s, x) => s + x.amount, e.amount);
    document.title = e.source + ' · Invoice Manager';
    $('dTitle').textContent = e.source;
    $('dCrumbs').innerHTML = `<a href="other-income.html">Other income</a> › ${esc(e.source)}`;
    $('dActions').innerHTML = `<a class="btn" href="other-income.html?open=${encodeURIComponent(e.id)}">Edit</a><button type="button" class="danger" id="delBtn">Delete</button>`;
    $('dBody').innerHTML = `
      <div class="cards">
        <div class="card green"><div class="k">Amount received</div><div class="v">${IM.money(e.amount)}</div><div class="s">${esc(IM.prettyDate(e.date))}</div></div>
        <a class="card" href="${esc(Acc.url('breakdown.html', { kind: 'income', cat: e.category }, Acc.range('all')))}"><div class="k">Category</div><div class="v" style="font-size:15px">${esc(e.category)}</div><div class="s">see all income in this category</div></a>
        <div class="card"><div class="k">From this source</div><div class="v">${IM.money(total)}</div><div class="s">${same.length + 1} entr${same.length ? 'ies' : 'y'}</div></div>
      </div>
      <div class="dgrid">
        <div class="dpanel"><h3>Income details</h3>${kv([['Received from', e.source], ['Date', IM.prettyDate(e.date)], ['Category', e.category], ['Payment method', e.method], ['Reference', e.reference], ['Description', e.description], ['Recorded by', e.by]])}</div>
        <div class="dpanel"><h3>More from ${esc(e.source)}</h3>
          ${same.length ? `<div class="tablewrap"><table class="inv"><tbody>${same.map((x) => `<tr><td>${IM.lnk('income.html?id=' + encodeURIComponent(x.id), IM.shortDate(x.date), 'plain')}</td><td>${esc(x.category)}</td><td class="num">${IM.money(x.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<span class="sub">No other entries from this source.</span>'}
          <p style="margin:10px 0 0;font-size:12.5px"><a class="lnk" href="${esc(Acc.url('other-income.html', { q: e.source }))}">All income from ${esc(e.source)}</a></p></div>
      </div>`;
    $('delBtn').addEventListener('click', async () => {
      if (!await IM.confirm({ title: 'Delete income?', message: `Delete ${IM.money(e.amount)} received from ${e.source} on ${IM.shortDate(e.date)}.`, detail: 'This cannot be undone.', confirmText: 'Delete', danger: true })) return;
      try { await IM.api({ action: 'deleteIncome', id: e.id }); IM.track('income_deleted'); location.href = 'other-income.html'; }
      catch (err) { IM.setMsg('dStatus', err.message, 'error'); }
    });
  }

  IM.boot({ page: 'other-income', fin: true }).then(async () => {
    IM.setMsg('dStatus', 'Loading…');
    try {
      all = (await IM.api({ action: 'accLists', from: '2000-01-01' })).income;
      const e = all.find((x) => x.id === id);
      if (!e) { IM.setMsg('dStatus', 'That entry was not found. It may have been deleted.', 'error'); $('dBody').innerHTML = '<p><a class="lnk" href="other-income.html">Back to other income</a></p>'; return; }
      IM.setMsg('dStatus', '');
      render(e);
    } catch (err) { IM.setMsg('dStatus', err.message, 'error'); }
  });
})();
