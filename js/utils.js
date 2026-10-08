/* Small helpers shared by every page: formatting, dates, money, amount in words, files. */
(function () {
  const IM = (window.IM = window.IM || {});

  IM.$ = (id) => document.getElementById(id);
  IM.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  IM.pad = (n) => String(n).padStart(2, '0');
  IM.isoOf = (d) => d.getFullYear() + '-' + IM.pad(d.getMonth() + 1) + '-' + IM.pad(d.getDate());
  IM.todayISO = () => IM.isoOf(new Date());
  IM.pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 + '%' : '—');
  IM.sum = (arr, k) => arr.reduce((s, i) => s + (Number(i[k]) || 0), 0);
  IM.numOf = (no) => parseInt(String(no).replace(/\D/g, ''), 10) || 0;
  IM.param = (name) => new URLSearchParams(location.search).get(name) || '';

  IM.parseISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  IM.prettyDate = (iso) => (iso ? IM.parseISO(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  IM.shortDate = (iso) => (iso ? IM.parseISO(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  IM.dateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  IM.daysBetween = (a, b) => {
    const [y1, m1, d1] = a.split('-').map(Number);
    const [y2, m2, d2] = b.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  };
  IM.withinEditWindow = (iso) => !!iso && (Date.now() - new Date(iso).getTime()) <= (window.APP_CONFIG.EDIT_HOURS || 48) * 3600 * 1000;

  /* money in the signed-in company's currency */
  const cur = () => (IM.company && IM.company.currency) || '';
  IM.money = (n) => cur() + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  IM.moneyC = (n) => cur() + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  /* amount in words, e.g. "One hundred dalasis and fifty bututs only" */
  const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function chunkWords(x) {
    let s = '';
    if (x >= 100) { s += ONES[Math.floor(x / 100)] + ' hundred'; x %= 100; if (x) s += ' and '; }
    if (x >= 20) { s += TENS[Math.floor(x / 10)]; if (x % 10) s += '-' + ONES[x % 10]; } else if (x > 0) { s += ONES[x]; }
    return s;
  }
  function intWords(n) {
    if (n === 0) return 'zero';
    const scales = ['', ' thousand', ' million', ' billion'];
    const parts = [];
    let i = 0;
    while (n > 0) { const c = n % 1000; if (c) parts.unshift(chunkWords(c) + scales[i]); n = Math.floor(n / 1000); i++; }
    return parts.join(' ');
  }
  const plural = (word, n) => (!word ? '' : ' ' + (n === 1 || /s$/i.test(word) ? word : word + 's'));
  IM.amountWords = (a) => {
    const c = IM.company || {};
    const total = Math.round((Number(a) || 0) * 100);
    const major = Math.floor(total / 100);
    const minor = total % 100;
    let s = intWords(major) + plural(c.currencyName, major);
    if (minor) s += c.currencyMinor ? ' and ' + intWords(minor) + plural(c.currencyMinor, minor) : ' point ' + intWords(minor);
    return s.charAt(0).toUpperCase() + s.slice(1) + ' only';
  };

  IM.setMsg = (el, msg, type) => {
    if (typeof el === 'string') el = IM.$(el);
    if (!el) return;
    el.textContent = msg || '';
    el.classList.remove('error', 'ok');
    if (type) el.classList.add(type);
  };

  /* files */
  IM.blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
  IM.blobToBase64 = async (blob) => (await IM.blobToDataUrl(blob)).split(',')[1];
  IM.base64ToBlob = (b64, type) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: type || 'application/octet-stream' });
  };
  IM.downloadBlob = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  IM.safeName = (s) => String(s).replace(/[\\/:*?"<>|]/g, '');

  /* grid (cards) or list (table) view, remembered per page on this device */
  IM.view = {
    get(key) { try { return localStorage.getItem('im_view:' + key) || 'grid'; } catch (e) { return 'grid'; } },
    wire(boxId, key, onChange) {
      const box = IM.$(boxId);
      if (!box) return;
      const paint = (v) => box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
      box.querySelectorAll('button').forEach((b) => { if (IM.icon) b.innerHTML = IM.icon(b.dataset.view === 'grid' ? 'grid' : 'list'); });
      paint(IM.view.get(key));
      box.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-view]');
        if (!b) return;
        try { localStorage.setItem('im_view:' + key, b.dataset.view); } catch (err) { /* ignore */ }
        paint(b.dataset.view);
        onChange(b.dataset.view);
      });
    }
  };

  // initials for avatars
  IM.initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
})();
