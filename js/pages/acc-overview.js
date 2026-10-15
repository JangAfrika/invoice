/* Accounting overview: income, expenses, profit and cash for a period, with plain-language insights. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  const Acc = IM.Acc;
  let data = null;

  function render() {
    const t = data.totals, p = data.previous.totals;
    const c = Acc.palette();
    const delta = (cur, prev) => (prev > 0 ? ` · ${cur >= prev ? '+' : '−'}${Math.abs(Math.round((cur - prev) / prev * 100))}% vs before` : '');
    const r = Acc.range($('accPeriod').value);
    const bd = (kind, params) => Acc.url('breakdown.html', Object.assign({ kind }, params), r);
    $('accCards').innerHTML = `
      <a class="card green" href="${bd('income')}"><div class="k">Income</div><div class="v">${IM.moneyC(t.income)}</div><div class="s">${IM.moneyC(t.invoiceIncome)} invoices + ${IM.moneyC(t.otherIncome)} other${delta(t.income, p.income)}</div></a>
      <a class="card red" href="${bd('expenses')}"><div class="k">Expenses</div><div class="v">${IM.moneyC(t.expenses)}</div><div class="s">${data.counts.expenses} entries${delta(t.expenses, p.expenses)}</div></a>
      <a class="card ${t.profit < 0 ? 'red' : 'green'}" href="${bd('profit')}"><div class="k">${t.profit < 0 ? 'Loss' : 'Profit'}</div><div class="v">${t.profit < 0 ? '−' : ''}${IM.moneyC(Math.abs(t.profit))}</div><div class="s">${t.margin === null ? 'no income yet' : t.margin + '% of income'}</div></a>
      <a class="card" href="${bd('cash')}"><div class="k">Cash balance</div><div class="v">${IM.moneyC(data.cash.now)}</div><div class="s">${IM.moneyC(data.receivables.outstanding)} still owed by customers</div></a>`;

    $('accInsights').innerHTML = Acc.insightsHtml(data.insights);

    if (typeof Chart !== 'undefined') {
      Chart.defaults.font.family = '"Segoe UI", Calibri, Arial, sans-serif';
      Chart.defaults.font.size = 11;
    }
    const m = data.months;
    const monthRange = (k) => ({ from: k + '-01', to: k + '-' + IM.pad(new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0).getDate()) });
    Acc.chart('chFlow', m.some((x) => x.income || x.expenses), {
      go: (i) => { location.href = Acc.url('breakdown.html', { kind: 'profit' }, monthRange(m[i].month)); },
      type: 'bar',
      data: { labels: m.map((x) => Acc.monthShort(x.month)), datasets: [
        { label: 'Income', data: m.map((x) => x.income), backgroundColor: c.income, borderRadius: 3 },
        { label: 'Expenses', data: m.map((x) => x.expenses), backgroundColor: c.expense, borderRadius: 3 },
        { type: 'line', label: 'Profit', data: m.map((x) => x.profit), borderColor: c.profit, backgroundColor: c.profit, tension: .3, pointRadius: 3 }
      ] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: (v) => IM.moneyC(v) } } } }
    });
    const cats = data.expenseByCategory.slice(0, 8);
    Acc.chart('chCats', cats.length > 0, {
      go: (i) => { location.href = Acc.url('breakdown.html', { kind: 'expenses', cat: cats[i].name }, Acc.range($('accPeriod').value)); },
      type: 'doughnut',
      data: { labels: cats.map((x) => x.name), datasets: [{ data: cats.map((x) => x.amount), backgroundColor: c.series, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'right', labels: { boxWidth: 10 } },
        tooltip: { callbacks: { label: (i) => ` ${i.label}: ${IM.moneyC(i.parsed)} (${cats[i.dataIndex].share}%)` } } } }
    });
    const b = data.receivables.buckets;
    Acc.chart('chAge', b.some((x) => x.amount > 0), {
      go: () => { location.href = 'invoices.html?f=outstanding'; },
      type: 'bar',
      data: { labels: b.map((x) => x.label), datasets: [{ data: b.map((x) => x.amount), backgroundColor: ['#8ea0b8', '#f0a82a', '#e8776b', '#c8102e'], borderRadius: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => IM.moneyC(v) } } } }
    });

    const list = (rows, empty, href) => rows.length ? `<ul class="mini-list">${rows.map((r) => `<li><span class="n"><a href="${esc(href(r))}">${esc(r.name)}</a></span><span class="a">${IM.moneyC(r.amount)}</span></li>`).join('')}</ul>` : `<div class="empty-state" style="padding:18px">${empty}</div>`;
    $('topVendors').innerHTML = list(data.topVendors.slice(0, 6), 'No expenses in this period.', (x) => Acc.url('expenses.html', { q: x.name }, r));
    $('topCustomers').innerHTML = list(data.topCustomers.slice(0, 6), 'No invoice payments in this period.', (x) => IM.href.customer('', x.name));
    $('incomeMix').innerHTML = data.incomeByCategory.length
      ? data.incomeByCategory.map((x) => `<div class="bar-row"><span class="n"><a href="${esc(bd('income', { cat: x.name }))}">${esc(x.name)}</a></span><span class="bar"><i style="width:${Math.max(2, x.share)}%"></i></span><span>${IM.moneyC(x.amount)}</span></div>`).join('')
      : '<div class="empty-state" style="padding:18px">No income in this period.</div>';
    $('periodNote').textContent = `${IM.shortDate(data.from)} to ${IM.shortDate(data.to)}. Cash basis: money counts on the day it is paid or received.`;
  }

  async function load() {
    const r = Acc.range($('accPeriod').value);
    IM.setMsg('accStatus', data ? 'Refreshing…' : 'Loading…');
    try {
      data = await IM.api({ action: 'accSummary', from: r.from, to: r.to });
      IM.setMsg('accStatus', '');
      render();
    } catch (err) { IM.setMsg('accStatus', err.message, 'error'); }
  }

  function settingsDialog() {
    $('setOpening').value = data.settings.openingBalance || '';
    $('setLock').value = data.settings.lockedUntil || '';
    $('setLock').max = IM.todayISO();
    $('setError').textContent = '';
    $('setDialog').showModal();
  }

  IM.boot({ page: 'accounting', fin: true }).then(() => {
    $('accPeriod').innerHTML = Acc.periodOptions('last12');
    $('accPeriod').addEventListener('change', load);
    $('reloadBtn').addEventListener('click', load);
    document.addEventListener('im:theme', () => { if (data) render(); });
    if (IM.isAdmin()) {
      $('settingsBtn').hidden = false;
      $('settingsBtn').addEventListener('click', () => data && settingsDialog());
      $('setCancel').addEventListener('click', () => $('setDialog').close());
      $('setForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        $('setSave').disabled = true;
        try {
          await IM.api({ action: 'saveAccSettings', openingBalance: Number($('setOpening').value) || 0, lockedUntil: $('setLock').value });
          $('setDialog').close();
          IM.track('accounting_settings');
          await load();
        } catch (err) { $('setError').textContent = err.message; }
        $('setSave').disabled = false;
      });
    }
    load();
  });
})();
