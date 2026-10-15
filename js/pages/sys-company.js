/* System Admin > one company: profile, users, and its money (income, expenses, profit, receivables) for any period. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  const Acc = IM.Acc;
  const id = IM.param('id');
  let info = null, fin = null, chart = null;

  const stat = (cls, icon, num, lbl, sub) => `<div class="stat ${cls}"><span class="icon">${IM.icon(icon)}</span><div class="txt"><div class="num">${num}</div><div class="lbl">${esc(lbl)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div></div>`;
  const m = (n) => IM.moneyC(n);

  function drawChart() {
    const cv = $('chFin');
    if (!cv || !fin || !window.Chart) return;
    if (chart) chart.destroy();
    const light = IM.sysTheme() === 'light';
    chart = new Chart(cv, { type: 'bar',
      data: { labels: fin.summary.months.map((x) => Acc.monthShort(x.month)), datasets: [
        { label: 'Income', data: fin.summary.months.map((x) => x.income), backgroundColor: '#35c27a', borderRadius: 3 },
        { label: 'Expenses', data: fin.summary.months.map((x) => x.expenses), backgroundColor: '#ff7a7a', borderRadius: 3 },
        { type: 'line', label: 'Profit', data: fin.summary.months.map((x) => x.profit), borderColor: '#5b8cff', backgroundColor: '#5b8cff', tension: .3, pointRadius: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, color: light ? '#444' : '#ccd', plugins: { legend: { position: 'bottom' } },
        scales: { y: { ticks: { callback: (v) => m(v) } } } } });
  }

  function render() {
    const c = info.company, S = fin.summary, t = S.totals;
    IM.company = IM.company || {}; IM.company.currency = c.currency || '';
    $('cTitle').innerHTML = `${esc(c.name)} ${IM.pill(c.status)}`;
    $('cCrumbs').innerHTML = `<a href="sys-companies.html">Companies</a> › ${esc(c.name)}`;
    $('cBody').innerHTML = `
      <div class="stats">
        ${stat('green', 'money', m(t.income), 'Income', `${m(t.invoiceIncome)} from invoices`)}
        ${stat('yellow', 'wallet', m(t.expenses), 'Expenses', S.counts.expenses + ' entries')}
        ${stat(t.profit < 0 ? 'purple' : 'blue', 'chart', (t.profit < 0 ? '−' : '') + m(Math.abs(t.profit)), t.profit < 0 ? 'Loss' : 'Profit', t.margin === null ? 'no income yet' : t.margin + '% of income')}
        ${stat('purple', 'invoice', m(S.receivables.outstanding), 'Owed by customers', `cash balance ${m(S.cash.now)}`)}
      </div>
      <section class="box chartbox"><h2>Income, expenses and profit by month <span class="grow"><span class="range">${esc(IM.shortDate(S.from))} to ${esc(IM.shortDate(S.to))}</span></span></h2><div class="cv"><canvas id="chFin"></canvas></div></section>
      <div class="sys-grid">
        <section class="box"><h2>Company details</h2><dl class="kv">
          <dt>Owner</dt><dd>${esc(c.owner || '—')} ${c.ownerEmail ? '· ' + esc(c.ownerEmail) : ''}</dd><dt>Email</dt><dd>${esc(c.email || '—')}</dd><dt>Phone</dt><dd>${esc(c.phone || '—')}</dd>
          <dt>Address</dt><dd>${esc(c.address || '—')}</dd><dt>Industry</dt><dd>${esc(c.industry || '—')}</dd><dt>Country</dt><dd>${esc(c.country || '—')}</dd>
          <dt>Joined</dt><dd>${esc(c.createdAt ? IM.prettyDate(c.createdAt.slice(0, 10)) : '')}</dd><dt>Last sign-in</dt><dd>${esc(IM.ago(c.lastLogin))}</dd>
          <dt>Numbers</dt><dd>${c.invoices} invoices · ${c.customers} customers · ${esc(m(c.invoiced))} invoiced · ${esc(m(c.collected))} collected</dd>
        </dl></section>
        <section class="box"><h2>Users (${info.users.length})</h2><div class="tblwrap"><table class="tbl"><tbody>
          ${info.users.map((u) => `<tr><td><b>${esc(u.name)}</b><span class="sub">${esc(u.email || u.username)}</span></td><td>${IM.pill(u.role, 'role')}</td><td>${u.active ? IM.pill('Active') : IM.pill('Off', 'no')}</td><td>${esc(IM.ago(u.lastLogin))}</td></tr>`).join('')}
        </tbody></table></div><p class="hint" style="margin:10px 0 0"><a class="lnk" href="sys-users.html?q=${encodeURIComponent(c.name)}">Manage these users</a></p></section>
        <section class="box"><h2>Profit and loss</h2><div class="tblwrap"><table class="tbl"><tbody>
          <tr><td colspan="2"><b>Income</b></td></tr>
          ${S.incomeByCategory.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${m(x.amount)}</td></tr>`).join('') || '<tr><td class="empty" colspan="2">No income.</td></tr>'}
          <tr><td><b>Total income</b></td><td class="num"><b>${m(t.income)}</b></td></tr>
          <tr><td colspan="2"><b>Expenses</b></td></tr>
          ${S.expenseByCategory.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${m(x.amount)}</td></tr>`).join('') || '<tr><td class="empty" colspan="2">No expenses.</td></tr>'}
          <tr><td><b>Total expenses</b></td><td class="num"><b>${m(t.expenses)}</b></td></tr>
          <tr><td><b>${t.profit < 0 ? 'Net loss' : 'Net profit'}</b></td><td class="num ${t.profit < 0 ? 'neg' : 'pos'}"><b>${t.profit < 0 ? '−' : ''}${m(Math.abs(t.profit))}</b></td></tr>
        </tbody></table></div></section>
        <section class="box"><h2>Latest invoices</h2><div class="tblwrap"><table class="tbl"><tbody>
          ${fin.recentInvoices.map((i) => `<tr><td><b>${esc(i.no)}</b><span class="sub">${esc(IM.shortDate(i.date))}</span></td><td>${esc(i.client)}</td><td class="num">${m(i.total)}<span class="sub">${m(i.paid)} paid</span></td><td>${IM.pill(i.status)}</td></tr>`).join('') || '<tr><td class="empty">No invoices.</td></tr>'}
        </tbody></table></div></section>
        <section class="box wide"><h2>Latest money movements <span class="grow"><span class="range">${fin.ledger.length} shown</span></span></h2><div class="tblwrap"><table class="tbl"><thead><tr><th>Date</th><th>Type</th><th>Who</th><th>Category</th><th class="num">Amount</th></tr></thead><tbody>
          ${fin.ledger.map((r) => `<tr><td>${esc(IM.shortDate(r.date))}</td><td>${esc(r.type)}</td><td>${esc(r.who || '')}${r.ref ? `<span class="sub">${esc(r.ref)}</span>` : ''}</td><td>${esc(r.category || '')}</td><td class="num ${r.kind === 'in' ? 'pos' : 'neg'}">${r.kind === 'in' ? '+' : '−'}${m(r.amount)}</td></tr>`).join('') || '<tr><td class="empty" colspan="5">No money recorded in this period.</td></tr>'}
        </tbody></table></div></section>
        <section class="box wide"><h2>Recent activity</h2><div class="tblwrap"><table class="tbl"><tbody>
          ${info.activity.map((a) => `<tr><td style="white-space:nowrap">${esc(IM.dateTime(a.at))}</td><td>${esc(a.user)}</td><td>${esc(a.action)}<span class="sub">${esc(a.details || '')}</span></td></tr>`).join('') || '<tr><td class="empty">Nothing yet.</td></tr>'}
        </tbody></table></div></section>
      </div>`;
    drawChart();
  }

  async function load() {
    const r = Acc.range($('cPeriod').value);
    IM.setMsg('cStatus', info ? 'Refreshing…' : 'Loading…');
    try {
      const [a, b] = await Promise.all([IM.api({ action: 'sysCompany', id }), IM.api({ action: 'sysCompanyFinance', id, from: r.from, to: r.to })]);
      info = a; fin = b;
      IM.setMsg('cStatus', '');
      render();
    } catch (err) { IM.setMsg('cStatus', err.message, 'error'); }
  }

  IM.sysBoot({ page: 'companies', title: 'Company' }).then(() => {
    if (!id) { location.replace('sys-companies.html'); return; }
    $('cPeriod').innerHTML = Acc.periodOptions('last12');
    $('cPeriod').addEventListener('change', load);
    $('reloadBtn').addEventListener('click', load);
    document.addEventListener('click', (e) => { if (e.target.closest('#themeBtn')) setTimeout(drawChart, 50); });
    load();
  });
})();
