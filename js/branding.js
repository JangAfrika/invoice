/* Each company's look: brand colour and logo.
   The logo is kept as a data: URL (from the server, then remembered by the browser) so it always appears in PDFs. */
(function () {
  const IM = (window.IM = window.IM || {});
  IM.logoSrc = '';

  IM.applyBrand = function () {
    const c = IM.company || {};
    if (c.brandColor) document.documentElement.style.setProperty('--brand', c.brandColor);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && c.brandColor) meta.setAttribute('content', c.brandColor);
  };

  // resolves to the logo data URL ('' when the company has none)
  IM.loadLogo = async function () {
    const c = IM.company || {};
    if (!c.logoId) { IM.logoSrc = ''; return ''; }
    const cached = IM.store.readLogo(c.id, c.logoId);
    if (cached) { IM.logoSrc = cached; return cached; }
    try {
      const out = await IM.api({ action: 'getLogo' });
      IM.logoSrc = out.logo || '';
      if (out.logo) IM.store.saveLogo(c.id, out.logoId, out.logo);
    } catch (e) {
      IM.logoSrc = '';
    }
    return IM.logoSrc;
  };

  IM.setLogo = function (logoId, dataUrl) {
    IM.logoSrc = dataUrl || '';
    if (IM.company && dataUrl) IM.store.saveLogo(IM.company.id, logoId, dataUrl);
    document.dispatchEvent(new CustomEvent('im:logo', { detail: IM.logoSrc }));
  };

  // a new logo uploaded elsewhere: fetch it
  document.addEventListener('im:company', () => {
    const c = IM.company || {};
    if (!c.logoId) { IM.setLogo('', ''); return; }
    if (IM.store.readLogo(c.id, c.logoId) !== IM.logoSrc || !IM.logoSrc) {
      IM.loadLogo().then((src) => document.dispatchEvent(new CustomEvent('im:logo', { detail: src })));
    }
  });
})();
