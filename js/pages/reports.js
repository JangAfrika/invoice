/* Accounting reports: profit and loss, month by month, and every transaction. Print or export to Excel (CSV). */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  const Acc = IM.Acc;
  let sum = null, ledger = [], kind = 'all';

  const row = (label, amt, cls, href) => `<tr class="${cls || ''}"><td>${href ? IM.lnk(href, label, 'plain') : esc(label)}</td><td class="num">${href ? IM.lnk(href, IM.money(amt), 'plain') : IM.money(amt)}</td></tr>`;

  function render() {
    const t = sum.totals;
    const rg = { from: sum.from, to: sum.to };
    const bd = (kind, cat) => Acc.url('breakdown.html', { kind, cat }, rg);
    $('repTitle').textContent = `Profit and loss: ${IM.shortDate(sum.from)} to ${IM.shortDate(sum.to)}`;
    $('plBody').innerHTML =
      '<tr class="grp"><td colspan="2">Income</td></tr>' +
      (sum.incomeByCategory.length ? sum.incomeByCategory.map((x) => row(x.name, x.amount, '', bd('income', x.name))).join('') : row('No income recorded', 0)) +
      row('Total income', t.income, 'tot', bd('income')) +
      '<tr class="grp"><td colspan="2">Expenses</td></tr>' +
      (sum.expenseByCategory.length ? sum.expenseByCategory.map((x) => row(x.name, x.amount, '', bd('expenses', x.name))).join('') : row('No expenses recorded', 0)) +
      row('Total expenses', t.expenses, 'tot', bd('expenses')) +
      `<tr class="tot big"><td>${IM.lnk(bd('profit'), t.profit < 0 ? 'Net loss' : 'Net profit', 'plain')}</td><td class="num ${t.profit < 0 ? 'neg' : 'pos'}">${t.profit < 0 ? '−' : ''}${IM.money(Math.abs(t.profit))}</td></tr>`;
    $('plNote').textContent = (t.margin === null ? '' : `Profit margin ${t.margin}%. `) + (t.tax ? `Tax included in expenses: ${IM.money(t.tax)}. ` : '') +
      `Previous period: ${IM.money(sum.previous.totals.profit)} profit.`;

    $('moBody').innerHTML = sum.months.map((m) => `<tr><td>${IM.lnk(Acc.url('breakdown.html', { kind: 'profit' }, { from: m.month + '-01', to: m.month + '-' + IM.pad(new Date(Number(m.month.slice(0, 4)), Number(m.month.slice(5, 7)), 0).getDate()) }), Acc.monthLabel(m.month), 'plain')}</td><td class="num">${IM.money(m.income)}</td><td class="num">${IM.money(m.expenses)}</td><td class="num">${Acc.signed(m.profit)}</td></tr>`).join('') +
      `<tr class="tot"><td>Total</td><td class="num">${IM.money(t.income)}</td><td class="num">${IM.money(t.expenses)}</td><td class="num">${Acc.signed(t.profit)}</td></tr>`;

    const q = $('txSearch').value.trim().toLowerCase();
    const list = ledger.filter((r) => (kind === 'all' || r.kind === kind) && (!q || [r.who, r.type, r.category, r.ref].join(' ').toLowerCase().includes(q)));
    const inT = list.filter((r) => r.kind === 'in').reduce((s, r) => s + r.amount, 0), outT = list.filter((r) => r.kind === 'out').reduce((s, r) => s + r.amount, 0);
    $('txSummary').textContent = `${list.length} transactions · in ${IM.money(inT)} · out ${IM.money(outT)}`;
    $('txBody').innerHTML = list.length ? list.slice(0, 1000).map((r) => `
      <tr><td>${esc(IM.shortDate(r.date))}</td><td>${esc(r.type)}</td><td><b>${IM.lnk(r.type === 'Invoice payment' ? IM.href.receipt(r.id) : (r.type === 'Other income' ? 'other-income.html?open=' : 'expenses.html?open=') + encodeURIComponent(r.id), r.who || r.ref || '—')}</b>${r.ref && r.who ? `<span class="sub">${esc(r.ref)}</span>` : ''}</td><td>${esc(r.category || '')}</td>
      <td class="num ${r.kind === 'in' ? 'pos' : 'neg'}">${r.kind === 'in' ? '+' : '−'}${IM.money(r.amount)}</td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">No transactions here.</td></tr>';
  }

  async function load() {
    const r = Acc.range($('repPeriod').value);
    IM.setMsg('repStatus', 'Loading…');
    try {
      const [s, l] = await Promise.all([IM.api({ action: 'accSummary', from: r.from, to: r.to }), IM.api({ action: 'accLedger', from: r.from, to: r.to })]);
      sum = s; ledger = l.rows;
      IM.setMsg('repStatus', '');
      render();
    } catch (err) { IM.setMsg('repStatus', err.message, 'error'); }
  }

  IM.boot({ page: 'reports', fin: true }).then(() => {
    $('repPeriod').innerHTML = Acc.periodOptions('year');
    $('repPeriod').addEventListener('change', load);
    $('txSearch').addEventListener('input', () => sum && render());
    $('txKind').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]');
      if (!b) return;
      kind = b.dataset.k;
      document.querySelectorAll('#txKind button').forEach((x) => x.classList.toggle('active', x === b));
      if (sum) render();
    });
    $('printBtn').addEventListener('click', () => { IM.track('report_printed'); window.print(); });
    $('csvTx').addEventListener('click', () => {
      if (!sum) return;
      IM.track('report_exported', { type: 'transactions' });
      Acc.csv(`Transactions ${sum.from} to ${sum.to}.csv`, [['Date', 'In or out', 'Type', 'Who', 'Reference', 'Category', 'Method', 'Amount']]
        .concat(ledger.map((r) => [r.date, r.kind === 'in' ? 'In' : 'Out', r.type, r.who, r.ref, r.category, r.method, (r.kind === 'in' ? '' : '-') + r.amount])));
    });
    $('csvPl').addEventListener('click', () => {
      if (!sum) return;
      IM.track('report_exported', { type: 'profit_and_loss' });
      const t = sum.totals;
      Acc.csv(`Profit and loss ${sum.from} to ${sum.to}.csv`, [['Profit and loss', sum.from + ' to ' + sum.to], [], ['Income'], ...sum.incomeByCategory.map((x) => [x.name, x.amount]), ['Total income', t.income], [],
        ['Expenses'], ...sum.expenseByCategory.map((x) => [x.name, x.amount]), ['Total expenses', t.expenses], [], [t.profit < 0 ? 'Net loss' : 'Net profit', t.profit], [], ['Month', 'Income', 'Expenses', 'Profit'],
        ...sum.months.map((m) => [m.month, m.income, m.expenses, m.profit])]);
    });
    load();
  });
})();
