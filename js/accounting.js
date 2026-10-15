/* Shared by the accounting pages: periods, charts, insights, receipts, CSV. */
(function () {
  const IM = (window.IM = window.IM || {});
  const { esc, pad } = IM;
  const Acc = (IM.Acc = {});

  Acc.PERIODS = [
    ['month', 'This month'], ['last', 'Last month'], ['quarter', 'This quarter'], ['year', 'This year'],
    ['last12', 'Last 12 months'], ['lastyear', 'Last year'], ['all', 'All time']
  ];
  // a page opened from a figure elsewhere (?from=&to=) gets one extra "Selected dates" period
  Acc.custom = (/^\d{4}-\d{2}-\d{2}$/.test(IM.param('from')) && /^\d{4}-\d{2}-\d{2}$/.test(IM.param('to'))) ? { from: IM.param('from'), to: IM.param('to') } : null;
  Acc.periodOptions = (selected) => {
    const opts = Acc.PERIODS.map((p) => `<option value="${p[0]}"${p[0] === selected && !Acc.custom ? ' selected' : ''}>${p[1]}</option>`).join('');
    return Acc.custom ? `<option value="custom" selected>${esc(IM.shortDate(Acc.custom.from))} to ${esc(IM.shortDate(Acc.custom.to))}</option>` + opts : opts;
  };
  // link to a page filtered to a period: Acc.url('expenses.html', { cat: 'Rent' }, range)
  Acc.url = (page, params, r) => {
    const q = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => { if (params[k]) q.set(k, params[k]); });
    if (r) { q.set('from', r.from); q.set('to', r.to); }
    const s = q.toString();
    return page + (s ? '?' + s : '');
  };

  const lastDay = (y, m) => new Date(y, m, 0).getDate();   // m is 1-12
  Acc.range = function (key) {
    if (key === 'custom' && Acc.custom) return Acc.custom;
    const d = new Date(), y = d.getFullYear(), m = d.getMonth() + 1, today = IM.todayISO();
    const ym = (yy, mm) => { const t = new Date(yy, mm - 1, 1); return [t.getFullYear(), t.getMonth() + 1]; };
    const first = (yy, mm) => `${yy}-${pad(mm)}-01`;
    const end = (yy, mm) => `${yy}-${pad(mm)}-${pad(lastDay(yy, mm))}`;
    if (key === 'month') return { from: first(y, m), to: today };
    if (key === 'last') { const [ly, lm] = ym(y, m - 1); return { from: first(ly, lm), to: end(ly, lm) }; }
    if (key === 'quarter') { const qm = Math.floor((m - 1) / 3) * 3 + 1; return { from: first(y, qm), to: today }; }
    if (key === 'year') return { from: `${y}-01-01`, to: today };
    if (key === 'lastyear') return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    if (key === 'all') return { from: '2000-01-01', to: today };
    const [sy, sm] = ym(y, m - 11);
    return { from: first(sy, sm), to: today };
  };

  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  Acc.monthLabel = (ym) => MN[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4);
  Acc.monthShort = (ym) => MN[Number(ym.slice(5, 7)) - 1] + " '" + ym.slice(2, 4);
  Acc.signed = (n) => `<span class="${n < 0 ? 'neg' : 'pos'}">${n < 0 ? '−' : ''}${IM.moneyC(Math.abs(n))}</span>`;

  Acc.insightsHtml = (list) => (list || []).map((i) =>
    `<div class="insight ${esc(i.level)}"><b>${esc(i.title)}</b><span>${esc(i.text)}</span></div>`).join('');

  /* charts (Chart.js, loaded from the CDN on the pages that use it) */
  const charts = {};
  Acc.chart = function (id, hasData, config) {
    const cv = IM.$(id), wrap = cv.parentElement;
    let none = wrap.querySelector('.none');
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    if (!hasData || typeof Chart === 'undefined') {
      cv.style.display = 'none';
      if (!none) { none = document.createElement('div'); none.className = 'none'; wrap.appendChild(none); }
      none.textContent = typeof Chart === 'undefined' ? 'Charts could not load. Check your internet connection.' : 'Nothing to show for this period.';
      none.hidden = false;
      return null;
    }
    cv.style.display = '';
    if (none) none.hidden = true;
    // config.go(index, datasetIndex) makes bars/slices clickable
    if (config.go) {
      const go = config.go;
      config.options = config.options || {};
      config.options.onClick = (e, els) => { if (els.length) go(els[0].index, els[0].datasetIndex); };
      config.options.onHover = (e, els) => { cv.style.cursor = els.length ? 'pointer' : 'default'; };
    }
    charts[id] = new Chart(cv, config);
    return charts[id];
  };
  Acc.dark = () => IM.theme.get() === 'dark';
  Acc.palette = () => ({
    income: Acc.dark() ? '#35c27a' : '#1f9d4a', expense: Acc.dark() ? '#ff7a7a' : '#d64545', profit: Acc.dark() ? '#5b8cff' : '#12306b',
    series: ['#5b8cff', '#35c27a', '#f0a82a', '#e8776b', '#9a7be0', '#26b5c9', '#d96aa7', '#8ea0b8']
  });

  /* receipts: open one in a new tab (the window opens first so pop-up blockers allow it) */
  Acc.openReceipt = async function (id, onError) {
    let w = null;
    try { w = window.open('', '_blank'); if (w) w.document.write('<p style="font-family:sans-serif">Opening the receipt…</p>'); } catch (e) { w = null; }
    try {
      const out = await IM.api({ action: 'getExpenseReceipt', id });
      const blob = IM.base64ToBlob(out.base64, out.mime || 'application/octet-stream');
      if (w && !w.closed) w.location.href = URL.createObjectURL(blob);
      else IM.downloadBlob(blob, out.fileName);
    } catch (err) {
      if (w && !w.closed) w.close();
      if (onError) onError(err); else IM.alert(err.message);
    }
  };

  /* file -> { fileName, mime, base64 }: photos are shrunk first, PDFs go as they are */
  Acc.prepareReceipt = async function (file) {
    if (!file) throw new Error('Choose a file.');
    if (file.type === 'application/pdf') {
      if (file.size > 7 * 1024 * 1024) throw new Error('That PDF is too large (7 MB at most).');
      return { fileName: file.name, mime: file.type, base64: await IM.blobToBase64(file) };
    }
    const img = await IM.resizeImage(file, 1800, 1800);
    const ext = img.mimeType === 'image/png' ? '.png' : '.jpg';
    return { fileName: file.name.replace(/\.[^.]+$/, '') + ext, mime: img.mimeType, base64: img.base64 };
  };

  /* CSV that opens in Excel */
  Acc.csv = function (name, rows) {
    const cell = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const text = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
    IM.downloadBlob(new Blob([text], { type: 'text/csv;charset=utf-8' }), IM.safeName(name));
  };
})();
