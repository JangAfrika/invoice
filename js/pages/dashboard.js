/* Dashboard: key numbers and charts for the company, plus a "get ready" checklist for new companies. */
(function () {
  const IM = window.IM;
  const { $, pad, sum, pct } = IM;
  const charts = {};
  let invoices = [], payments = [], customers = [];
  const COLORS = { paid: '#1f9d4a', partial: '#e0a100', unpaid: '#e8776b', overdue: '#c8102e', cancelled: '#9aa3b2' };

  function displayStatus(inv) {
    if (inv.status === 'Cancelled') return 'Cancelled';
    if (inv.status === 'Paid') return 'Paid';
    if (inv.due && inv.due < IM.todayISO()) return 'Overdue';
    return inv.status === 'Partial' ? 'Partial' : 'Unpaid';
  }

  function periodStart(p) {
    const d = new Date();
    if (p === 'all') return '';
    if (p === 'year') return `${d.getFullYear()}-01-01`;
    if (p === 'month') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
    d.setDate(d.getDate() - (p === 'd30' ? 30 : 90));
    return IM.isoOf(d);
  }

  function mkChart(id, hasData, config) {
    const cv = $(id);
    const wrap = cv.parentElement;
    let none = wrap.querySelector('.none');
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    if (!hasData || typeof Chart === 'undefined') {
      cv.style.display = 'none';
      if (!none) { none = document.createElement('div'); none.className = 'none'; wrap.appendChild(none); }
      none.textContent = typeof Chart === 'undefined' ? 'Charts could not load. Check your internet connection.' : 'No data for this period.';
      none.hidden = false;
      return;
    }
    cv.style.display = '';
    if (none) none.hidden = true;
    charts[id] = new Chart(cv, config);
  }

  function gettingStarted() {
    const c = IM.company || {};
    const steps = [
      { done: !!c.logoId, html: '<a href="company.html">Upload your logo</a> and check your company details', admin: true },
      { done: !!(c.phone || c.address), html: '<a href="company.html">Add your phone and address</a> (printed on invoices)', admin: true },
      { done: customers.length > 0, html: '<a href="customers.html">Add your first customer</a>' },
      { done: invoices.length > 0, html: '<a href="invoice-new.html">Create your first invoice</a>' }
    ].filter((s) => !s.admin || IM.isAdmin());
    const allDone = steps.every((s) => s.done);
    $('gettingStarted').hidden = allDone;
    $('gsList').innerHTML = steps.map((s) => `<li class="${s.done ? 'done' : ''}">${s.html}</li>`).join('');
  }

  function render() {
    gettingStarted();
    if (typeof Chart !== 'undefined') Chart.defaults.font.family = '"Segoe UI", Calibri, Arial, sans-serif';
    const navy = IM.theme.get() === 'dark' ? '#5b8cff' : (getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#12306b');

    const start = periodStart($('ovPeriod').value);
    const inRange = (dt) => !start || (dt && dt >= start);
    const invs = invoices.filter((i) => inRange(i.date));
    const live = invs.filter((i) => i.status !== 'Cancelled');
    const pays = payments.filter((p) => inRange(p.date));

    /* KPI cards */
    const invoiced = sum(live, 'total');
    const collected = sum(live, 'paid');
    const owed = sum(live, 'balance');
    const overdue = live.filter((i) => displayStatus(i) === 'Overdue');
    const overdueAmt = sum(overdue, 'balance');
    const paidInv = live.filter((i) => i.status === 'Paid');
    const dayList = paidInv.filter((i) => i.lastPay && i.date).map((i) => Math.max(0, IM.daysBetween(i.date, i.lastPay)));
    const avgDays = dayList.length ? Math.round(dayList.reduce((a, b) => a + b, 0) / dayList.length) : null;
    const s = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

    $('ovCards').innerHTML = `
      <div class="card"><div class="k">Total invoiced</div><div class="v">${IM.moneyC(invoiced)}</div><div class="s">${s(live.length, 'invoice')}${invs.length - live.length ? ' (' + (invs.length - live.length) + ' cancelled excluded)' : ''}</div></div>
      <div class="card green"><div class="k">Collected</div><div class="v">${IM.moneyC(collected)}</div><div class="s">${pct(collected, invoiced)} of invoiced · ${paidInv.length} of ${live.length} fully paid</div></div>
      <div class="card"><div class="k">Outstanding</div><div class="v">${IM.moneyC(owed)}</div><div class="s">${pct(owed, invoiced)} of invoiced</div></div>
      <div class="card red"><div class="k">Overdue</div><div class="v">${IM.moneyC(overdueAmt)}</div><div class="s">${s(overdue.length, 'invoice')} · ${pct(overdueAmt, owed)} of outstanding</div></div>
      <div class="card"><div class="k">Average invoice</div><div class="v">${live.length ? IM.moneyC(invoiced / live.length) : '—'}</div><div class="s">${live.length ? 'largest ' + IM.moneyC(Math.max.apply(null, live.map((i) => i.total))) : 'no invoices'}</div></div>
      <div class="card"><div class="k">Average time to get paid</div><div class="v">${avgDays === null ? '—' : s(avgDays, 'day')}</div><div class="s">${dayList.length ? 'from ' + s(dayList.length, 'fully paid invoice') : 'no fully paid invoices yet'}</div></div>`;

    /* monthly: invoiced vs received */
    const invByM = {}, recByM = {};
    live.forEach((i) => { if (i.date) { const k = i.date.slice(0, 7); invByM[k] = (invByM[k] || 0) + i.total; } });
    pays.forEach((p) => { if (p.date) { const k = p.date.slice(0, 7); recByM[k] = (recByM[k] || 0) + p.amount; } });
    const keys = Object.keys(invByM).concat(Object.keys(recByM)).sort();
    let months = [];
    if (keys.length) {
      const nowKey = IM.todayISO().slice(0, 7);
      let [y, m] = keys[0].split('-').map(Number);
      const [ey, em] = (keys[keys.length - 1] > nowKey ? keys[keys.length - 1] : nowKey).split('-').map(Number);
      while (y < ey || (y === ey && m <= em)) { months.push(y + '-' + pad(m)); m++; if (m > 12) { m = 1; y++; } }
      if (months.length > 36) months = months.slice(-36);
    }
    const monthLabel = (k) => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }); };
    mkChart('chMonthly', months.length > 0, {
      type: 'bar',
      data: {
        labels: months.map(monthLabel),
        datasets: [
          { label: 'Invoiced', data: months.map((k) => invByM[k] || 0), backgroundColor: navy, borderRadius: 3 },
          { label: 'Received', data: months.map((k) => recByM[k] || 0), backgroundColor: COLORS.paid, borderRadius: 3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${IM.moneyC(c.parsed.y)}` } } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => IM.moneyC(v) } } }
      }
    });

    /* status doughnut */
    const counts = { Paid: 0, Partial: 0, Unpaid: 0, Overdue: 0, Cancelled: 0 };
    invs.forEach((i) => { counts[displayStatus(i)]++; });
    const sKeys = Object.keys(counts).filter((k) => counts[k] > 0);
    mkChart('chStatus', invs.length > 0, {
      type: 'doughnut',
      data: {
        labels: sKeys.map((k) => `${k} · ${counts[k]} (${pct(counts[k], invs.length)})`),
        datasets: [{ data: sKeys.map((k) => counts[k]), backgroundColor: sKeys.map((k) => COLORS[k.toLowerCase()]), borderWidth: 2, borderColor: IM.theme.get() === 'dark' ? '#181c25' : '#fff' }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: (c) => ' ' + c.label } } } }
    });

    /* payment methods doughnut */
    const byMethod = {};
    pays.forEach((p) => { const k = p.method || 'Not stated'; byMethod[k] = (byMethod[k] || 0) + p.amount; });
    const mKeys = Object.keys(byMethod).sort((a, b) => byMethod[b] - byMethod[a]);
    const mTotal = sum(pays, 'amount');
    const mColors = [navy, '#1f9d4a', '#e0a100', '#7a5af8', '#e8776b', '#9aa3b2'];
    mkChart('chMethods', mKeys.length > 0, {
      type: 'doughnut',
      data: {
        labels: mKeys.map((k) => `${k} · ${IM.moneyC(byMethod[k])} (${pct(byMethod[k], mTotal)})`),
        datasets: [{ data: mKeys.map((k) => byMethod[k]), backgroundColor: mKeys.map((k, i) => mColors[i % mColors.length]), borderWidth: 2, borderColor: IM.theme.get() === 'dark' ? '#181c25' : '#fff' }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: (c) => ' ' + c.label } } } }
    });

    /* top customers */
    const byClient = {};
    live.forEach((i) => {
      const key = i.customerId || i.client.trim().toLowerCase();
      if (!byClient[key]) byClient[key] = { name: i.client.trim(), total: 0, paid: 0 };
      byClient[key].total += i.total;
      byClient[key].paid += i.paid;
    });
    const top = Object.values(byClient).sort((a, b) => b.total - a.total).slice(0, 6);
    const cut = (x) => (x.length > 20 ? x.slice(0, 19) + '…' : x);
    mkChart('chClients', top.length > 0, {
      type: 'bar',
      data: {
        labels: top.map((c) => `${cut(c.name)} · ${pct(c.total, invoiced)}`),
        datasets: [
          { label: 'Paid', data: top.map((c) => c.paid), backgroundColor: COLORS.paid },
          { label: 'Still owed', data: top.map((c) => Math.max(0, c.total - c.paid)), backgroundColor: COLORS.partial }
        ]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${IM.moneyC(c.parsed.x)}` } } },
        scales: { x: { stacked: true, beginAtZero: true, ticks: { callback: (v) => IM.moneyC(v) } }, y: { stacked: true } }
      }
    });

    /* ageing of unpaid balances (all invoices) */
    const buckets = [0, 0, 0, 0];
    const today = IM.todayISO();
    invoices.filter((i) => (i.status === 'Unpaid' || i.status === 'Partial') && i.balance > 0 && i.date).forEach((i) => {
      const age = IM.daysBetween(i.date, today);
      buckets[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3] += i.balance;
    });
    const bTotal = buckets.reduce((a, b) => a + b, 0);
    const bNames = ['0–30 days', '31–60 days', '61–90 days', 'Over 90 days'];
    mkChart('chAgeing', bTotal > 0, {
      type: 'bar',
      data: { labels: bNames.map((n, i) => `${n} · ${pct(buckets[i], bTotal)}`), datasets: [{ data: buckets, backgroundColor: ['#e0a100', '#e8963a', '#e8776b', '#c8102e'], borderRadius: 3 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + IM.moneyC(c.parsed.y) } } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => IM.moneyC(v) } } }
      }
    });
  }

  async function load() {
    IM.setMsg('ovStatus', 'Loading…');
    try {
      await IM.loadList((data, cached) => {
        invoices = data.invoices; payments = data.payments; customers = data.customers;
        render();
        IM.setMsg('ovStatus', cached ? 'Updating…' : '');
      });
      IM.setMsg('ovStatus', '');
    } catch (err) {
      IM.setMsg('ovStatus', err.message, 'error');
    }
  }

  IM.boot({ page: 'dashboard' }).then(() => {
    $('ovPeriod').addEventListener('change', render);
    $('reloadBtn').addEventListener('click', load);
    document.addEventListener('im:company', render);
    document.addEventListener('im:theme', render);
    load();
  });
})();
