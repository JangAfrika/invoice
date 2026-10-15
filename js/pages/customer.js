/* One customer: contact details, money summary, every invoice and receipt (each opens its own page). */
(function () {
  const IM = window.IM;
  const { $, esc, sum } = IM;
  const kv = (rows) => `<dl class="kv">${rows.filter((r) => r[1] !== '' && r[1] != null).map((r) => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>`;

  function render(c, invs, pays) {
    const live = invs.filter((i) => i.status !== 'Cancelled');
    const owed = sum(live.filter((i) => i.status !== 'Paid'), 'balance');
    document.title = c.name + ' · Invoice Manager';
    $('dTitle').textContent = c.name;
    $('dCrumbs').innerHTML = `<a href="customers.html">Customers</a> › ${esc(c.name)}`;
    $('dActions').innerHTML = `${c.id ? `<a class="btn primary" href="invoice-new.html?customer=${encodeURIComponent(c.id)}">New invoice</a>` : ''}<a class="btn" href="customers.html">All customers</a>`;
    $('dBody').innerHTML = `
      <div class="cards">
        <a class="card" href="#invoices"><div class="k">Total invoiced</div><div class="v">${IM.money(sum(live, 'total'))}</div><div class="s">${live.length} invoice${live.length === 1 ? '' : 's'}</div></a>
        <a class="card green" href="#payments"><div class="k">Paid</div><div class="v">${IM.money(sum(live, 'paid'))}</div><div class="s">${pays.length} payment${pays.length === 1 ? '' : 's'}</div></a>
        <a class="card ${owed > 0.005 ? 'red' : ''}" href="invoices.html?${c.id ? 'customer=' + encodeURIComponent(c.id) + '&' : 'q=' + encodeURIComponent(c.name) + '&'}f=outstanding"><div class="k">Still owes</div><div class="v">${IM.money(owed)}</div><div class="s">${live.filter((i) => i.status !== 'Paid').length} not fully paid</div></a>
      </div>
      <div class="dgrid">
        <div class="dpanel wide"><h3>Contact</h3>${kv([['Email', c.email], ['Phone', c.phone], ['Address', c.address], ['Notes', c.notes], ['Customer since', c.createdAt ? IM.shortDate(c.createdAt.slice(0, 10)) : '']]) || '<span class="sub">No contact details saved.</span>'}</div>
        <div class="dpanel wide" id="invoices"><h3>Invoices</h3><div class="tablewrap"><table class="inv"><thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody>
          ${invs.length ? invs.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((i) => { const s = IM.displayStatus(i); return `<tr><td><b>${IM.invLink(i)}</b></td><td>${esc(IM.shortDate(i.date))}</td><td>${i.due ? esc(IM.shortDate(i.due)) : '—'}</td><td class="num">${IM.money(i.total)}</td><td class="num">${IM.money(i.paid)}</td><td class="num">${i.status === 'Cancelled' ? '—' : IM.money(i.balance)}</td><td><span class="pill ${s.toLowerCase()}">${s}</span></td></tr>`; }).join('') : '<tr><td colspan="7" class="empty">No invoices for this customer yet.</td></tr>'}
        </tbody></table></div></div>
        <div class="dpanel wide" id="payments"><h3>Payments received</h3><div class="tablewrap"><table class="inv"><thead><tr><th>Receipt</th><th>Invoice</th><th>Date</th><th>Method</th><th class="num">Amount</th></tr></thead><tbody>
          ${pays.length ? pays.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((p) => `<tr><td><b>${IM.rcLink(p)}</b></td><td>${p.direct ? '<span class="sub">No invoice</span>' : IM.lnk(IM.href.invoice(p.invoiceId), p.invoiceNo)}</td><td>${esc(IM.shortDate(p.date))}</td><td>${esc(p.method || '—')}</td><td class="num">${IM.money(p.amount)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">No payments yet.</td></tr>'}
        </tbody></table></div></div>
      </div>`;
  }

  async function load() {
    IM.setMsg('dStatus', 'Loading…');
    try {
      let data;
      await IM.loadList((d) => { data = d; });
      const id = IM.param('id'), name = IM.param('name').trim().toLowerCase();
      let c = data.customers.find((x) => x.id === id) || (name && data.customers.find((x) => x.name.trim().toLowerCase() === name));
      if (!c && name) c = { id: '', name: IM.param('name'), email: '', phone: '', address: '', notes: '' };     // invoiced by name only
      if (!c) { IM.setMsg('dStatus', 'That customer was not found.', 'error'); $('dBody').innerHTML = '<p><a class="lnk" href="customers.html">Back to customers</a></p>'; return; }
      const mine = (x) => (c.id ? x.customerId === c.id : x.client.trim().toLowerCase() === c.name.trim().toLowerCase());
      IM.setMsg('dStatus', '');
      render(c, data.invoices.filter(mine), data.payments.filter(mine));
    } catch (err) { IM.setMsg('dStatus', err.message, 'error'); }
  }
  IM.boot({ page: 'customers' }).then(load);
})();
