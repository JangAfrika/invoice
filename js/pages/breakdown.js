/* What is behind a figure: opened from Income, Expenses, Profit or Cash balance (or a category / month).
   Shows the totals, the groups and every transaction; each transaction opens its receipt, invoice or entry. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  const Acc = IM.Acc;
  const kind = ['income', 'expenses', 'profit', 'cash'].indexOf(IM.param('kind')) >= 0 ? IM.param('kind') : 'profit';
  const cat = IM.param('cat');
  const TITLES = { income: 'Income', expenses: 'Expenses', profit: 'Profit and loss', cash: 'Cash balance' };
  const plural = (n) => n + (n === 1 ? ' entry' : ' entries');
  let rows = [], range = null, summary = null;

  // where a transaction lives
  function open(r) {
    if (r.type === 'Invoice payment') return IM.href.receipt(r.id);
    if (r.type === 'Other income') return 'other-income.html?open=' + encodeURIComponent(r.id);
    return 'expenses.html?open=' + encodeURIComponent(r.id);
  }

  function groupTable(list, label) {
    const by = {};
    list.forEach((r) => { const k = r.category || 'Uncategorised'; (by[k] = by[k] || { n: 0, amount: 0, kind: r.kind }); by[k].n++; by[k].amount += r.amount; });
    const keys = Object.keys(by).sort((a, b) => by[b].amount - by[a].amount);
    if (!keys.length) return '';
    return `<div class="dpanel"><h3>${esc(label)}</h3><div class="tablewrap"><table class="inv"><thead><tr><th>Category</th><th class="num">Entries</th><th class="num">Amount</th></tr></thead><tbody>
      ${keys.map((k) => `<tr><td>${IM.lnk(Acc.url('breakdown.html', { kind: by[k].kind === 'in' ? 'income' : 'expenses', cat: k === 'Uncategorised' ? '' : k }, range), k)}</td><td class="num">${by[k].n}</td><td class="num">${IM.money(by[k].amount)}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  }

  function render() {
    const t = summary ? summary.totals : null;
    let list = rows.filter((r) => (kind === 'income' ? r.kind === 'in' : kind === 'expenses' ? r.kind === 'out' : true) && (!cat || r.category === cat));
    const q = $('bdSearch') ? $('bdSearch').value.trim().toLowerCase() : '';
    if (q) list = list.filter((r) => [r.who, r.type, r.category, r.ref].join(' ').toLowerCase().includes(q));
    const inT = list.filter((r) => r.kind === 'in').reduce((s, r) => s + r.amount, 0), outT = list.filter((r) => r.kind === 'out').reduce((s, r) => s + r.amount, 0);
    const net = inT - outT;
    $('dTitle').textContent = TITLES[kind] + (cat ? ': ' + cat : '');
    document.title = $('dTitle').textContent + ' · Invoice Manager';
    $('dCrumbs').innerHTML = `<a href="accounting.html">Accounting</a> › ${esc(TITLES[kind])}${cat ? ' › ' + esc(cat) : ''}`;

    const cards = [];
    if (kind !== 'expenses') cards.push(`<div class="card green"><div class="k">Income</div><div class="v">${IM.money(inT)}</div><div class="s">${plural(list.filter((r) => r.kind === 'in').length)}</div></div>`);
    if (kind !== 'income') cards.push(`<div class="card red"><div class="k">Expenses</div><div class="v">${IM.money(outT)}</div><div class="s">${plural(list.filter((r) => r.kind === 'out').length)}</div></div>`);
    if (kind === 'profit') cards.push(`<div class="card ${net < 0 ? 'red' : 'green'}"><div class="k">${net < 0 ? 'Loss' : 'Profit'}</div><div class="v">${net < 0 ? '−' : ''}${IM.money(Math.abs(net))}</div><div class="s">${t && t.margin !== null ? t.margin + '% of income' : ''}</div></div>`);
    if (kind === 'cash' && summary) {
      cards.push(`<div class="card"><div class="k">Opening balance</div><div class="v">${IM.money(summary.settings.openingBalance || 0)}</div><div class="s">before you started recording</div></div>`);
      cards.push(`<div class="card"><div class="k">Cash balance</div><div class="v">${IM.money(summary.cash.now)}</div><div class="s">opening + all income − all expenses</div></div>`);
    }
    const months = {};
    list.forEach((r) => { const k = r.date.slice(0, 7); const m = months[k] || (months[k] = { in: 0, out: 0 }); m[r.kind] += r.amount; });
    const mk = Object.keys(months).sort().reverse();
    const monthLink = (k) => { const y = Number(k.slice(0, 4)), m = Number(k.slice(5, 7)); const last = new Date(y, m, 0).getDate(); return Acc.url('breakdown.html', { kind, cat }, { from: k + '-01', to: k + '-' + IM.pad(last) }); };

    $('dBody').innerHTML = `
      <div class="filterbar"><span>${esc(IM.shortDate(range.from))} to ${esc(IM.shortDate(range.to))}</span><input id="bdSearch" type="search" placeholder="Search name, reference or category" value="${esc(q)}" style="flex:1;min-width:140px">
        <a class="btn" href="reports.html">Reports</a></div>
      <div class="cards">${cards.join('')}</div>
      <div class="dgrid">
        ${kind !== 'expenses' ? groupTable(list.filter((r) => r.kind === 'in'), 'Income by category') : ''}
        ${kind !== 'income' ? groupTable(list.filter((r) => r.kind === 'out'), 'Expenses by category') : ''}
        ${mk.length > 1 ? `<div class="dpanel"><h3>By month</h3><div class="tablewrap"><table class="inv"><thead><tr><th>Month</th>${kind !== 'expenses' ? '<th class="num">Income</th>' : ''}${kind !== 'income' ? '<th class="num">Expenses</th>' : ''}${kind === 'profit' ? '<th class="num">Profit</th>' : ''}</tr></thead><tbody>
          ${mk.map((k) => `<tr><td>${IM.lnk(monthLink(k), Acc.monthLabel(k))}</td>${kind !== 'expenses' ? `<td class="num">${IM.money(months[k].in)}</td>` : ''}${kind !== 'income' ? `<td class="num">${IM.money(months[k].out)}</td>` : ''}${kind === 'profit' ? `<td class="num">${Acc.signed(months[k].in - months[k].out)}</td>` : ''}</tr>`).join('')}
        </tbody></table></div></div>` : ''}
        <div class="dpanel wide"><h3>Every transaction (${list.length})</h3><div class="tablewrap"><table class="inv"><thead><tr><th>Date</th><th>Type</th><th>Who</th><th>Category</th><th class="num">Amount</th></tr></thead><tbody>
          ${list.length ? list.slice(0, 1000).map((r) => `<tr class="clk" data-href="${esc(open(r))}"><td>${esc(IM.shortDate(r.date))}</td><td>${esc(r.type)}</td><td>${IM.lnk(open(r), r.who || r.ref || '—')}${r.ref && r.who ? `<span class="sub">${esc(r.ref)}</span>` : ''}</td><td>${esc(r.category || '')}</td><td class="num ${r.kind === 'in' ? 'pos' : 'neg'}">${r.kind === 'in' ? '+' : '−'}${IM.money(r.amount)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">Nothing recorded for these dates.</td></tr>'}
        </tbody></table></div></div>
      </div>`;
    $('bdSearch').addEventListener('input', () => { const el = $('bdSearch'); const v = el.value; render(); const n = $('bdSearch'); n.focus(); n.setSelectionRange(v.length, v.length); });
  }

  async function load() {
    range = IM.param('from') && IM.param('to') ? { from: IM.param('from'), to: IM.param('to') } : Acc.range(IM.param('period') || 'last12');
    IM.setMsg('dStatus', 'Loading…');
    try {
      const need = [IM.api({ action: 'accLedger', from: kind === 'cash' ? '2000-01-01' : range.from, to: kind === 'cash' ? IM.todayISO() : range.to })];
      if (kind === 'cash' || kind === 'profit') need.push(IM.api({ action: 'accSummary', from: range.from, to: range.to }));
      const [l, s] = await Promise.all(need);
      rows = l.rows; summary = s || null;
      if (kind === 'cash') range = { from: '2000-01-01', to: IM.todayISO() };
      IM.setMsg('dStatus', '');
      render();
    } catch (err) { IM.setMsg('dStatus', err.message, 'error'); }
  }
  IM.boot({ page: 'accounting', fin: true }).then(() => {
    $('dBody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a')) location.href = tr.dataset.href; });
    load();
  });
})();
