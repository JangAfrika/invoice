/* Company profile (Owner / Admin): details, logo, colours, numbering and printed text, with a live invoice preview. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  let stripes = [];

  const SAMPLE = {
    client: 'Sample Customer Ltd',
    customer: { phone: '+220 000 0000', address: 'Customer address' },
    date: IM.todayISO(), due: '', notes: '',
    rows: [
      { item: 'Service', desc: 'Example line on your invoice', qty: 2, price: 1250, amount: 2500 },
      { item: 'Product', desc: 'Another line', qty: 1, price: 750.5, amount: 750.5 }
    ],
    total: 3250.5
  };

  function fill(c) {
    $('fName').value = c.name || '';
    $('fPhone').value = c.phone || '';
    $('fEmail').value = c.email || '';
    $('fAddress').value = c.address || '';
    $('fWebsite').value = c.website || '';
    $('fTaxId').value = c.taxId || '';
    $('fServices').value = c.services || '';
    $('fAbout').value = c.about || '';
    $('fIndustry').value = c.industry || '';
    $('fCountry').value = c.country || '';
    $('fCurrency').value = c.currency || '';
    $('fCurName').value = c.currencyName || '';
    $('fCurMinor').value = c.currencyMinor || '';
    $('fInvPrefix').value = c.invoicePrefix || '';
    $('fInvNext').value = c.nextInvoiceNo || 1001;
    $('fRcPrefix').value = c.receiptPrefix || '';
    $('fRcNext').value = c.nextReceiptNo || 1001;
    $('fMethods').value = (c.paymentMethods || []).join(', ');
    $('fPayDetails').value = c.paymentDetails || '';
    $('fTerms').value = c.terms || '';
    $('fThanks').value = c.thanks || '';
    $('fBrand').value = c.brandColor || '#12306b';
    stripes = (c.stripeColors || []).slice();
    drawStripes();
    preview();
  }

  function draft() {
    return Object.assign({}, IM.company, {
      name: $('fName').value.trim(), phone: $('fPhone').value.trim(), email: $('fEmail').value.trim(),
      address: $('fAddress').value.trim(), website: $('fWebsite').value.trim(), taxId: $('fTaxId').value.trim(),
      services: $('fServices').value.trim(),
      about: $('fAbout').value.trim(),
      industry: $('fIndustry').value.trim(),
      country: $('fCountry').value.trim(),
      currency: $('fCurrency').value.trim(), currencyName: $('fCurName').value.trim(), currencyMinor: $('fCurMinor').value.trim(),
      invoicePrefix: $('fInvPrefix').value.trim().toUpperCase(), nextInvoiceNo: $('fInvNext').value,
      receiptPrefix: $('fRcPrefix').value.trim().toUpperCase(), nextReceiptNo: $('fRcNext').value,
      paymentMethods: $('fMethods').value.split(',').map((x) => x.trim()).filter(Boolean),
      paymentDetails: $('fPayDetails').value.trim(), terms: $('fTerms').value.trim(), thanks: $('fThanks').value.trim(),
      brandColor: $('fBrand').value, stripeColors: stripes.slice()
    });
  }

  function drawStripes() {
    $('stripes').innerHTML = stripes.length
      ? stripes.map((s, i) => `<span style="display:inline-flex;align-items:center;gap:2px"><input type="color" value="${esc(s)}" data-i="${i}" aria-label="Stripe colour ${i + 1}"><button type="button" class="linkbtn" data-del="${i}" aria-label="Remove">×</button></span>`).join('')
      : '<span class="hint" style="margin:0">Brand colour only</span>';
    $('stripeAdd').hidden = stripes.length >= 5;
  }

  // draws the sample invoice with the values in the form (without saving them)
  function preview() {
    const d = draft();
    const real = IM.company;
    IM.company = d;
    document.documentElement.style.setProperty('--brand', d.brandColor || '#12306b');
    IM.renderInvoice($('prevDoc'), SAMPLE, { invoiceNo: (d.invoicePrefix || 'INV') + (d.nextInvoiceNo || '1001') });
    $('wordsDemo').textContent = IM.amountWords(1250.5);
    $('numDemo').textContent = (d.invoicePrefix || '?') + (d.nextInvoiceNo || '?') + ' and ' + (d.receiptPrefix || '?') + (d.nextReceiptNo || '?');
    IM.company = real;
    const scale = $('prevFrame').clientWidth / 794;
    $('prevDoc').style.transform = `scale(${scale})`;
    $('prevFrame').style.height = Math.ceil($('prevDoc').offsetHeight * scale) + 'px';
  }

  function showLogo(src) {
    $('logoPrev').innerHTML = src ? `<img src="${esc(src)}" alt="Company logo">` : 'No logo yet';
    $('logoRemove').hidden = !src;
  }

  async function save(e) {
    if (e) e.preventDefault();
    const d = draft();
    if (d.name.length < 2) { IM.setMsg('coStatus', 'Enter the company name.', 'error'); $('fName').focus(); return; }
    ['saveTop', 'saveBottom'].forEach((id) => { $(id).disabled = true; });
    IM.setMsg('coStatus', 'Saving…');
    try {
      const out = await IM.api({ action: 'updateCompany', company: d });
      IM.setCompany(out.company);
      fill(out.company);
      IM.setMsg('coStatus', 'Saved. New invoices and receipts use these details.', 'ok');
    } catch (err) {
      IM.setMsg('coStatus', err.message, 'error');
    } finally {
      ['saveTop', 'saveBottom'].forEach((id) => { $(id).disabled = false; });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  IM.boot({ page: 'company', admin: true }).then(() => {
    fill(IM.company);
    IM.loadLogo().then((src) => { showLogo(src); preview(); });
    // always edit the latest saved version
    IM.refreshCompany().then((out) => fill(out.company)).catch((err) => IM.setMsg('coStatus', err.message, 'error'));

    $('coForm').addEventListener('input', preview);
    $('coForm').addEventListener('submit', save);
    $('saveTop').addEventListener('click', save);
    window.addEventListener('resize', preview);

    $('stripes').addEventListener('input', (e) => { if (e.target.dataset.i !== undefined) { stripes[Number(e.target.dataset.i)] = e.target.value; preview(); } });
    $('stripes').addEventListener('click', (e) => { if (e.target.dataset.del !== undefined) { stripes.splice(Number(e.target.dataset.del), 1); drawStripes(); preview(); } });
    $('stripeAdd').addEventListener('click', () => { stripes.push(stripes.length ? '#ffffff' : $('fBrand').value); drawStripes(); preview(); });
    $('stripeClear').addEventListener('click', () => { stripes = []; drawStripes(); preview(); });

    $('logoFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      $('logoError').textContent = '';
      try {
        const img = await IM.resizeImage(file, 600, 300);
        showLogo(img.dataUrl);
        $('logoError').className = 'err';
        $('logoError').textContent = 'Uploading…';
        const out = await IM.api({ action: 'uploadLogo', base64: img.base64, mimeType: img.mimeType });
        IM.setLogo(out.company.logoId, out.logo);
        IM.setCompany(out.company);
        $('logoError').className = 'err ok';
        $('logoError').textContent = 'Logo saved.';
        preview();
      } catch (err) {
        $('logoError').className = 'err';
        $('logoError').textContent = err.message;
        IM.loadLogo().then(showLogo);
      }
    });

    $('logoRemove').addEventListener('click', async () => {
      if (!await IM.confirm({ title: 'Remove logo?', message: 'Your logo will be removed from the app and from new invoices and receipts.', detail: 'Invoices and receipts already created keep the logo they were made with.', confirmText: 'Remove logo', danger: true })) return;
      try {
        const out = await IM.api({ action: 'removeLogo' });
        IM.setLogo('', '');
        IM.setCompany(out.company);
        showLogo('');
        preview();
      } catch (err) {
        $('logoError').textContent = err.message;
      }
    });
  });
})();
