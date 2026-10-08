/* System Admin dashboard: totals, 30-day activity chart, companies waiting for approval, open tickets, latest sign-ins. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  let chart = null;
  let data = null;

  function stat(cls, icon, num, label, sub, href) {
    return `<a class="stat ${cls}" href="${href}"><span class="icon">${IM.icon(icon)}</span>
      <span class="txt"><div class="num">${esc(num)}</div><div class="lbl">${esc(label)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</span></a>`;
  }

  function drawChart() {
    if (!data || !window.Chart) return;
    const dark = IM.sysTheme() === 'dark';
    const grid = dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
    const tick = dark ? '#8f96a3' : '#667085';
    const labels = data.chart.days.map((d) => IM.shortDate(d).replace(/ \d{4}$/, ''));
    const line = (label, values, color, dash) => ({
      label, data: values, borderColor: color, backgroundColor: color, tension: 0.4, pointRadius: 3, pointHoverRadius: 5,
      borderWidth: 2, borderDash: dash || [], fill: false
    });
    if (chart) chart.destroy();
    chart = new Chart($('chActivity'), {
      type: 'line',
      data: { labels, datasets: [
        line('Invoices created', data.chart.invoices, '#1597f3'),
        line('Successful sign-ins', data.chart.logins, '#1fbf68'),
        line('Failed sign-ins', data.chart.failed, '#ef4d4d', [4, 4]),
        line('New companies', data.chart.companies, '#f8b520')
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: tick, boxWidth: 10, font: { size: 11 } } } },
        scales: {
          x: { grid: { color: grid }, ticks: { color: tick, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y: { beginAtZero: true, grid: { color: grid }, ticks: { color: tick, font: { size: 10 }, precision: 0 } }
        }
      }
    });
  }

  function render() {
    const s = data.stats;
    $('stats').innerHTML =
      stat('purple', 'building', s.companies, 'Total Companies', `${s.active} active · ${s.pending} pending · ${s.suspended} suspended`, 'sys-companies.html') +
      stat('green', 'users', s.users, 'Total Users', `${s.online} online now · ${s.activeUsers} can sign in`, 'sys-users.html') +
      stat('blue', 'invoice', s.invoices, 'Total Invoices', `${s.invoicesToday} created today`, 'sys-activity.html') +
      stat('yellow', 'ticket', s.openTickets, 'Open Tickets', s.urgentTickets ? `${s.urgentTickets} high / urgent` : 'none urgent', 'sys-tickets.html');
    $('signins').textContent = `${s.loginsToday} sign-ins today · ${s.failedToday} failed`;
    IM.sysCounts(s.pending, s.openTickets);
    drawChart();

    $('pendingBody').innerHTML = data.pending.length ? data.pending.map((c) => `
      <tr><td><b>${esc(c.name)}</b><span class="sub">${esc(c.email || '')}</span></td>
        <td>${esc(IM.ago(c.createdAt))}</td>
        <td><div class="acts"><button type="button" class="good small" data-approve="${esc(c.id)}">Approve</button>
          <a class="btn small" href="sys-companies.html?id=${encodeURIComponent(c.id)}" style="padding:4px 9px;font-size:11px">Review</a></div></td></tr>`).join('')
      : '<tr><td colspan="3" class="empty">No companies waiting.</td></tr>';

    $('ticketBody').innerHTML = data.tickets.length ? data.tickets.map((t) => `
      <tr class="click" data-href="sys-tickets.html?id=${encodeURIComponent(t.id)}"><td><b>${esc(t.subject)}</b><span class="sub">${esc(t.company)} · ${esc(t.userName)}</span></td>
        <td>${IM.pill(t.priority)}</td><td>${IM.pill(t.status)}</td><td>${esc(IM.ago(t.updatedAt))}</td></tr>`).join('')
      : '<tr><td colspan="4" class="empty">No open tickets.</td></tr>';

    $('loginBody').innerHTML = data.logins.length ? data.logins.map((l) => `
      <tr><td>${esc(IM.ago(l.at))}</td><td><b>${esc(l.user || l.login)}</b><span class="sub">${esc(l.company || '')}</span></td>
        <td>${l.success ? IM.pill('OK', 'ok') : IM.pill('Failed')}${l.reason ? `<span class="sub">${esc(l.reason)}</span>` : ''}</td><td>${esc(l.device || '')}</td></tr>`).join('')
      : '<tr><td colspan="4" class="empty">No sign-ins yet.</td></tr>';
  }

  async function load() {
    IM.setMsg('dashStatus', data ? '' : 'Loading…');
    try {
      data = await IM.api({ action: 'sysOverview' });
      render();
      IM.setMsg('dashStatus', '');
    } catch (err) { IM.setMsg('dashStatus', err.message, 'error'); }
  }

  IM.sysBoot({ page: 'dashboard', title: 'Dashboard' }).then(() => {
    IM.onTheme = drawChart;
    $('reloadBtn').addEventListener('click', load);
    $('pendingBody').addEventListener('click', async (e) => {
      const id = e.target.dataset.approve;
      if (!id) return;
      e.target.disabled = true;
      try {
        await IM.api({ action: 'sysSetCompanyStatus', id, status: 'Active' });
        IM.setMsg('dashStatus', 'Company approved. They have been emailed.', 'ok');
        load();
      } catch (err) { IM.setMsg('dashStatus', err.message, 'error'); e.target.disabled = false; }
    });
    $('ticketBody').addEventListener('click', (e) => { const r = e.target.closest('[data-href]'); if (r) location.href = r.dataset.href; });
    load();
    setInterval(load, 60000);
  });
})();
