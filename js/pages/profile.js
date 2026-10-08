/* Company profile: who the company is, its numbers and its team. Everyone in the company can see it;
   Owners and Admins can edit it on the Settings page. Pending companies land here until approved. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;

  function fact(label, value, link) {
    if (!value) return '';
    return `<dt>${esc(label)}</dt><dd>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(value)}</a>` : esc(value)}</dd>`;
  }

  function render(out) {
    const c = out.company;
    const n = out.counts;
    $('pfName').textContent = c.name;
    const since = c.createdAt ? 'Member since ' + IM.prettyDate(c.createdAt.slice(0, 10)) : '';
    $('pfMeta').innerHTML = [
      `<span class="pill ${esc((c.status || 'Active').toLowerCase())}">${esc(c.status || 'Active')}</span>`,
      c.industry ? `<span>${esc(c.industry)}</span>` : '',
      c.country ? `<span>${esc(c.country)}</span>` : '',
      since ? `<span>${esc(since)}</span>` : ''
    ].filter(Boolean).join('');
    $('pfEdit').hidden = !IM.isAdmin();
    if (IM.logoSrc) $('pfLogo').innerHTML = `<img src="${IM.logoSrc}" alt="${esc(c.name)} logo">`;

    const pending = c.status === 'Pending';
    $('pfPending').hidden = !pending;
    if (pending) {
      const steps = [
        [!!c.logoId, 'Upload your logo'],
        [!!(c.phone && c.address), 'Add your phone and address'],
        [!!c.about, 'Describe your company (About)'],
        [!!c.paymentDetails, 'Add how clients pay you']
      ];
      $('pfPending').innerHTML = `<span><b>Waiting for approval.</b> You can start invoicing once the system administrator approves your company. A complete profile helps:
        ${steps.map(([done, t]) => `${done ? '✓' : '○'} ${t}`).join(' · ')}</span>
        ${IM.isAdmin() ? '<a class="btn" href="company.html" style="padding:4px 10px">Complete profile</a>' : ''}`;
    }

    $('pfCards').innerHTML = `
      <div class="card"><div class="k">Customers</div><div class="v">${n.customers}</div></div>
      <div class="card"><div class="k">Invoices</div><div class="v">${n.invoices}</div><div class="s">${n.receipts} receipts</div></div>
      <div class="card green"><div class="k">Collected</div><div class="v">${IM.money(n.collected)}</div><div class="s">of ${IM.money(n.invoiced)} invoiced</div></div>
      <div class="card red"><div class="k">Outstanding</div><div class="v">${IM.money(n.outstanding)}</div></div>`;

    $('pfAbout').textContent = c.about || (IM.isAdmin() ? 'No description yet. Add one under Settings.' : 'No description yet.');
    const web = c.website ? (/^https?:/i.test(c.website) ? c.website : 'https://' + c.website) : '';
    $('pfFacts').innerHTML = [
      fact('Email', c.email, c.email ? 'mailto:' + c.email : ''),
      fact('Phone', c.phone),
      fact('Address', c.address),
      fact('Website', c.website, web),
      fact('Tax / registration no.', c.taxId),
      fact('Services', c.services),
      fact('Currency', [c.currency, c.currencyName].filter(Boolean).join(' · ')),
      fact('Numbering', `Invoices ${c.invoicePrefix}${c.nextInvoiceNo}, receipts ${c.receiptPrefix}${c.nextReceiptNo} (next)`),
      fact('Payment methods', (c.paymentMethods || []).join(', '))
    ].join('');

    $('pfTeam').innerHTML = out.team.map((u) => `
      <li><span class="avatar">${esc(IM.initials(u.name))}</span>
        <span style="flex:1;min-width:0"><b>${esc(u.name)}</b><span class="sub">${esc(u.email || '')}</span></span>
        <span class="pill role">${esc(u.role)}</span></li>`).join('') || '<li>No team members.</li>';
    $('pfSupport').textContent = out.supportEmail ? `Open a ticket, or email ${out.supportEmail}.` : 'Open a ticket and the system administrator will answer by email.';
  }

  IM.boot({ page: 'profile' }).then(async () => {
    IM.setMsg('pfStatus', 'Loading…');
    try {
      const out = await IM.api({ action: 'profile' });
      if (out.company) IM.setCompany(out.company);
      await IM.loadLogo();
      render(out);
      IM.setMsg('pfStatus', '');
    } catch (err) {
      IM.setMsg('pfStatus', err.message, 'error');
    }
    document.addEventListener('im:logo', (e) => { if (e.detail) $('pfLogo').innerHTML = `<img src="${e.detail}" alt="">`; });
  });
})();
