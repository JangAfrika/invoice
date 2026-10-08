/* System Admin > Companies: approve new companies, suspend (with a reason) or reactivate, see each company's details. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  let companies = [];
  let filter = IM.param('status') || 'all';

  const money = (c, n) => (c.currency || '') + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  function render() {
    const q = $('search').value.trim().toLowerCase();
    const list = companies.filter((c) => (filter === 'all' || c.status === filter) &&
      (!q || [c.name, c.email, c.owner, c.ownerEmail, c.phone].join(' ').toLowerCase().includes(q)));
    const n = (s) => companies.filter((c) => c.status === s).length;
    $('cAll').textContent = companies.length; $('cPending').textContent = n('Pending'); $('cActive').textContent = n('Active'); $('cSuspended').textContent = n('Suspended');
    IM.sysCounts(n('Pending'), null);
    $('coBody').innerHTML = list.length ? list.map((c) => `
      <tr class="click" data-id="${esc(c.id)}">
        <td><b>${esc(c.name)}</b><span class="sub">${esc(c.email || '')}</span></td>
        <td>${esc(c.owner || '—')}<span class="sub">${esc(c.ownerEmail || '')}</span></td>
        <td class="num">${c.users}</td><td class="num">${c.customers}</td><td class="num">${c.invoices}</td>
        <td class="num">${esc(money(c, c.invoiced))}<span class="sub">${esc(money(c, c.collected))} paid</span></td>
        <td>${IM.pill(c.status)}${c.openTickets ? `<span class="sub">${c.openTickets} open ticket${c.openTickets > 1 ? 's' : ''}</span>` : ''}</td>
        <td>${esc(c.createdAt ? IM.shortDate(c.createdAt.slice(0, 10)) : '')}<span class="sub">last sign-in ${esc(IM.ago(c.lastLogin))}</span></td>
        <td><div class="acts">${actions(c)}</div></td>
      </tr>`).join('') : '<tr><td colspan="9" class="empty">No companies here.</td></tr>';
  }

  function actions(c) {
    if (c.status === 'Pending') return `<button type="button" class="good small" data-act="approve" data-id="${esc(c.id)}">Approve</button><button type="button" class="bad small" data-act="suspend" data-id="${esc(c.id)}">Reject</button>`;
    if (c.status === 'Suspended') return `<button type="button" class="good small" data-act="approve" data-id="${esc(c.id)}">Reactivate</button>`;
    return `<button type="button" class="bad small" data-act="suspend" data-id="${esc(c.id)}">Suspend</button>`;
  }

  async function setStatus(id, status, reason, notify) {
    const out = await IM.api({ action: 'sysSetCompanyStatus', id, status, reason, notify });
    const i = companies.findIndex((c) => c.id === id);
    if (i >= 0) companies[i] = out.company;
    render();
    return out.company;
  }

  function askSuspend(c) {
    $('susTitle').textContent = (c.status === 'Pending' ? 'Reject ' : 'Suspend ') + c.name;
    $('susReason').value = '';
    $('susNotify').checked = true;
    $('susError').textContent = '';
    $('susDialog').dataset.id = c.id;
    $('susDialog').showModal();
    $('susReason').focus();
  }

  async function openDetail(id) {
    const d = IM.drawer('<div class="msg">Loading…</div>');
    try {
      const out = await IM.api({ action: 'sysCompany', id });
      const c = out.company;
      d.innerHTML = `<button type="button" class="x" aria-label="Close" onclick="IM.closeDrawer()">${IM.icon('x')}</button>
        <h2>${esc(c.name)}</h2>
        <div>${IM.pill(c.status)} <span class="hint">since ${esc(c.createdAt ? IM.prettyDate(c.createdAt.slice(0, 10)) : '')}</span></div>
        ${c.statusReason ? `<p class="hint" style="margin-top:8px">Reason: ${esc(c.statusReason)}</p>` : ''}
        <div class="statusbar">${actions(c)}</div>
        <h3>Details</h3>
        <dl class="kv">
          <dt>Email</dt><dd>${esc(c.email || '—')}</dd><dt>Phone</dt><dd>${esc(c.phone || '—')}</dd>
          <dt>Address</dt><dd>${esc(c.address || '—')}</dd><dt>Industry</dt><dd>${esc(c.industry || '—')}</dd>
          <dt>Country</dt><dd>${esc(c.country || '—')}</dd><dt>Website</dt><dd>${esc(c.website || '—')}</dd>
          <dt>Tax no.</dt><dd>${esc(c.taxId || '—')}</dd><dt>About</dt><dd>${esc(c.about || '—')}</dd>
          <dt>Numbers</dt><dd>${c.invoices} invoices · ${c.customers} customers · ${esc(money(c, c.invoiced))} invoiced · ${esc(money(c, c.collected))} collected</dd>
        </dl>
        <h3>Users (${out.users.length})</h3>
        <table class="tbl"><tbody>${out.users.map((u) => `<tr><td><b>${esc(u.name)}</b><span class="sub">${esc(u.email || u.username)}</span></td><td>${IM.pill(u.role, 'role')}</td><td>${u.active ? IM.pill('Active') : IM.pill('Off', 'no')}</td><td>${esc(IM.ago(u.lastLogin))}</td></tr>`).join('')}</tbody></table>
        <h3>Recent activity</h3>
        <table class="tbl"><tbody>${out.activity.map((a) => `<tr><td style="white-space:nowrap">${esc(IM.dateTime(a.at))}</td><td>${esc(a.user)}</td><td>${esc(a.action)}<span class="sub">${esc(a.details || '')}</span></td></tr>`).join('') || '<tr><td class="empty">Nothing yet.</td></tr>'}</tbody></table>`;
    } catch (err) {
      d.innerHTML = `<button type="button" class="x" onclick="IM.closeDrawer()">${IM.icon('x')}</button><div class="msg error">${esc(err.message)}</div>`;
    }
  }

  async function load() {
    IM.setMsg('coStatus', companies.length ? '' : 'Loading…');
    try {
      companies = (await IM.api({ action: 'sysCompanies' })).companies;
      render();
      IM.setMsg('coStatus', '');
    } catch (err) { IM.setMsg('coStatus', err.message, 'error'); }
  }

  IM.sysBoot({ page: 'companies', title: 'Companies' }).then(() => {
    document.querySelectorAll('#chips button').forEach((b) => b.classList.toggle('active', b.dataset.f === filter));
    $('chips').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]');
      if (!b) return;
      filter = b.dataset.f;
      document.querySelectorAll('#chips button').forEach((x) => x.classList.toggle('active', x === b));
      render();
    });
    $('search').addEventListener('input', render);
    $('reloadBtn').addEventListener('click', load);

    const onAct = async (e) => {
      const btn = e.target.closest('[data-act]');
      if (btn) {
        e.stopPropagation();
        const c = companies.find((x) => x.id === btn.dataset.id);
        if (!c) return;
        if (btn.dataset.act === 'suspend') return askSuspend(c);
        btn.disabled = true;
        try {
          await setStatus(c.id, 'Active', '', true);
          IM.setMsg('coStatus', `${c.name} is active. The company has been emailed.`, 'ok');
          if (IM.$('drawer') && !IM.$('drawer').hidden) openDetail(c.id);
        } catch (err) { IM.setMsg('coStatus', err.message, 'error'); btn.disabled = false; }
        return;
      }
      const row = e.target.closest('tr[data-id]');
      if (row) openDetail(row.dataset.id);
    };
    $('coBody').addEventListener('click', onAct);
    document.addEventListener('click', (e) => { if (e.target.closest('#drawer [data-act]')) onAct(e); });

    $('susCancel').addEventListener('click', () => $('susDialog').close());
    $('susForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const reason = $('susReason').value.trim();
      if (reason.length < 3) { $('susError').textContent = 'Give the reason (the company will see it).'; return; }
      $('susSave').disabled = true;
      try {
        const id = $('susDialog').dataset.id;
        const c = await setStatus(id, 'Suspended', reason, $('susNotify').checked);
        $('susDialog').close();
        IM.setMsg('coStatus', `${c.name} is suspended. Nobody in it can sign in now.`, 'ok');
        if (IM.$('drawer') && !IM.$('drawer').hidden) openDetail(id);
      } catch (err) { $('susError').textContent = err.message; }
      $('susSave').disabled = false;
    });

    load().then(() => { if (IM.param('id')) openDetail(IM.param('id')); });
  });
})();
