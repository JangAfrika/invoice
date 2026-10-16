/* Projections: the next months from the company's own history, with a best and a worst case. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  const Acc = IM.Acc;
  let d = null;

  function render() {
    if (!d.enough) {
      $('pjBody').hidden = true;
      $('pjEmpty').hidden = false;
      $('pjEmpty').innerHTML = `${IM.icon('trend')}<div>${esc(d.message)}</div>`;
      return;
    }
    $('pjBody').hidden = false;
    $('pjEmpty').hidden = true;
    const t = d.totals, n = d.months.length, last = d.months[n - 1];
    const range = (o) => `<span class="range">${IM.moneyC(o.low)} to ${IM.moneyC(o.high)}</span>`;
    const past = Acc.range('last12');
    const bd = (k) => Acc.url('breakdown.html', { kind: k }, past);
    $('pjCards').innerHTML = `
      <a class="card green" href="${bd('income')}" title="See the past income this forecast is built from"><div class="k">Income, next ${n} months</div><div class="v">${IM.moneyC(t.income.expected)}</div><div class="s">${range(t.income)}</div></a>
      <a class="card red" href="${bd('expenses')}" title="See the past expenses this forecast is built from"><div class="k">Expenses</div><div class="v">${IM.moneyC(t.expenses.expected)}</div><div class="s">${range(t.expenses)}</div></a>
      <a class="card ${t.profit.expected < 0 ? 'red' : 'green'}" href="${bd('profit')}" title="See the past profit this forecast is built from"><div class="k">${t.profit.expected < 0 ? 'Loss' : 'Profit'}</div><div class="v">${t.profit.expected < 0 ? '−' : ''}${IM.moneyC(Math.abs(t.profit.expected))}</div><div class="s">${range(t.profit)}</div></a>
      <a class="card ${last.cash.expected < 0 ? 'red' : ''}" href="${bd('cash')}" title="See the cash balance today"><div class="k">Cash by ${esc(Acc.monthLabel(last.month))}</div><div class="v">${IM.moneyC(last.cash.expected)}</div><div class="s">${range(last.cash)} · now ${IM.moneyC(d.cashNow)}</div></a>`;

    const c = Acc.palette();
    const labels = d.months.map((m) => Acc.monthShort(m.month));
    Acc.chart('chProfit', true, {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Income (expected)', data: d.months.map((m) => m.income.expected), backgroundColor: c.income, borderRadius: 3 },
        { label: 'Expenses (expected)', data: d.months.map((m) => m.expenses.expected), backgroundColor: c.expense, borderRadius: 3 },
        { type: 'line', label: 'Profit (expected)', data: d.months.map((m) => m.profit.expected), borderColor: c.profit, backgroundColor: c.profit, tension: .3, pointRadius: 3 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: (v) => IM.moneyC(v) } } } }
    });
    Acc.chart('chCash', true, {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Best case', data: d.months.map((m) => m.cash.high), borderColor: c.income, borderDash: [5, 4], pointRadius: 0, tension: .25 },
        { label: 'Expected', data: d.months.map((m) => m.cash.expected), borderColor: c.profit, backgroundColor: c.profit, pointRadius: 3, tension: .25 },
        { label: 'Worst case', data: d.months.map((m) => m.cash.low), borderColor: c.expense, borderDash: [5, 4], pointRadius: 0, tension: .25 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: (v) => IM.moneyC(v) } } } }
    });

    $('pjRows').innerHTML = d.months.map((m) => `
      <tr><td>${esc(Acc.monthLabel(m.month))}</td><td class="num">${IM.moneyC(m.income.expected)}</td><td class="num">${IM.moneyC(m.expenses.expected)}</td>
      <td class="num">${Acc.signed(m.profit.expected)}</td><td class="num">${Acc.signed(m.profit.low)} to ${Acc.signed(m.profit.high)}</td><td class="num">${Acc.signed(m.cash.expected)}</td></tr>`).join('');
    $('pjAssump').innerHTML = d.assumptions.map((a) => `<li>${esc(a)}</li>`).join('');
  }

  async function load() {
    IM.setMsg('pjStatus', 'Calculating…');
    try {
      d = await IM.api({ action: 'accProjection', months: Number($('pjMonths').value) });
      IM.setMsg('pjStatus', '');
      render();
    } catch (err) { IM.setMsg('pjStatus', err.message, 'error'); }
  }

  IM.boot({ page: 'projections', fin: true }).then(() => {
    $('pjMonths').addEventListener('change', load);
    document.addEventListener('im:theme', () => { if (d) render(); });
    load();
  });
})();
