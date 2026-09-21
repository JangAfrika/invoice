/* ============ SETTINGS (edit these) ============ */
const CONFIG = {
  // Paste your Apps Script Web App URL here (ends with /exec)
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzZ0Q-oTSbU_XKfCC3EbiM0D2hYOixF1erGc9LaCRR_FsSLdoT1rC539Lo8uLnYAhDl/exec',

  COMPANY: {
    name: 'JangAfrica',
    location: 'Gunjur, The Gambia',
    phones: '+(220) 594 4287 / 263 0798',
    email: 'info.jangafrica@gmail.com',
    more: 'For more information, visit or contact our centre'
  },
  SERVICES: 'IT & CPS Training/Printing/Laminating/Scanning/Software Installation/Computer Repairs/Software Development/Database Management',
  CURRENCY: 'D',
  LOGO: 'logo.png', // keep logo.png in the same folder as index.html

  // Printed on every invoice. Leave PAYMENT_DETAILS empty to hide that block.
  PAYMENT_DETAILS: '', // e.g. 'Wave / Afrimoney: 000 0000 · Bank: ..., Acc. name ...'
  TERMS: 'Payment is due by the date shown above. Please quote the invoice number when paying.',
  THANKS: 'Thank you for your business.'
};
/* ================================================ */

const $ = (id) => document.getElementById(id);
let items = [];
let lastBlob = null;
let lastGen = null;          // the invoice as it was generated: { invoiceNo, data, fileName }
let lastFileName = '';
let invoices = [];
let payments = [];
let filter = 'all';
let payingNo = null;
let currentTab = 'new';
let rc = { p: null, blob: null, name: '' };
const charts = {};
let session = null;          // { token, user: { username, name } }
let logoSrc = window.LOGO_DATA || '';   // an embedded copy of the logo (logo.js, or fetched below) so PDFs never fail
const TOKEN_KEY = 'inv_token';

/* ---------- helpers ---------- */
const money = (n) => CONFIG.CURRENCY + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyC = (n) => CONFIG.CURRENCY + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayISO = () => isoOf(new Date());
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 + '%' : '—');
const sum = (arr, k) => arr.reduce((s, i) => s + (Number(i[k]) || 0), 0);

function parseISO(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
function prettyDate(iso) {
  return iso ? parseISO(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
}
function shortDate(iso) {
  return iso ? parseISO(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}
function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
function setMsg(el, msg, type) { el.textContent = msg || ''; el.className = (el.classList.contains('msg') ? 'msg ' : '') + (type || ''); }
function setStatus(msg, type) { const el = $('status'); el.textContent = msg || ''; el.className = type || ''; }

/* amount in words for receipts */
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function chunkWords(x) {
  let s = '';
  if (x >= 100) { s += ONES[Math.floor(x / 100)] + ' hundred'; x %= 100; if (x) s += ' and '; }
  if (x >= 20) { s += TENS[Math.floor(x / 10)]; if (x % 10) s += '-' + ONES[x % 10]; }
  else if (x > 0) { s += ONES[x]; }
  return s;
}
function intWords(n) {
  if (n === 0) return 'zero';
  const scales = ['', ' thousand', ' million', ' billion'];
  const parts = [];
  let i = 0;
  while (n > 0) {
    const c = n % 1000;
    if (c) parts.unshift(chunkWords(c) + scales[i]);
    n = Math.floor(n / 1000);
    i++;
  }
  return parts.join(' ');
}
function amountWords(a) {
  const total = Math.round((Number(a) || 0) * 100);
  const d = Math.floor(total / 100);
  const b = total % 100;
  let s = intWords(d) + (d === 1 ? ' dalasi' : ' dalasis');
  if (b) s += ' and ' + intWords(b) + (b === 1 ? ' butut' : ' bututs');
  return s.charAt(0).toUpperCase() + s.slice(1) + ' only';
}

/* ---------- tabs ---------- */
const STATUS_EL = { track: 'trackStatus', receipts: 'receiptsStatus', overview: 'ovStatus' };
const VIEWS = { new: 'newView', track: 'trackView', receipts: 'receiptsView', overview: 'overviewView' };

function showTab(name) {
  currentTab = name;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  Object.keys(VIEWS).forEach((k) => { $(VIEWS[k]).hidden = k !== name; });
  if (name !== 'new') reloadCurrent();
}
document.querySelector('.tabs').addEventListener('click', (e) => {
  if (e.target.dataset.tab) showTab(e.target.dataset.tab);
});

async function reloadCurrent() {
  if (currentTab === 'new') return;
  const el = $(STATUS_EL[currentTab]);
  setMsg(el, 'Loading…');
  try {
    const out = await api({ action: 'list' });
    invoices = out.invoices || [];
    payments = out.payments || [];
    setMsg(el, '');
    renderCurrent();
  } catch (err) {
    setMsg(el, err.message, 'error');
  }
}
function renderCurrent() {
  if (currentTab === 'track') renderTrack();
  else if (currentTab === 'receipts') renderReceipts();
  else if (currentTab === 'overview') renderOverview();
}
document.querySelectorAll('[data-reload]').forEach((b) => b.addEventListener('click', reloadCurrent));

/* ---------- item rows ---------- */
function newItem() { return { item: '', desc: '', qty: 1, price: 0 }; }

function drawItems() {
  const wrap = $('items');
  wrap.innerHTML = '';
  items.forEach((it, i) => {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div class="two">
        <label>Item<input data-k="item" data-i="${i}" value="${esc(it.item)}" placeholder="e.g. Service"></label>
        <label>Description<input data-k="desc" data-i="${i}" value="${esc(it.desc)}" placeholder="e.g. Installation"></label>
      </div>
      <div class="two">
        <label>Qty<input data-k="qty" data-i="${i}" type="number" min="0" step="any" value="${it.qty}"></label>
        <label>Unit price<input data-k="price" data-i="${i}" type="number" min="0" step="any" value="${it.price}"></label>
      </div>
      ${items.length > 1 ? `<button type="button" class="remove" data-remove="${i}">Remove item</button>` : ''}
    `;
    wrap.appendChild(div);
  });
}

$('items').addEventListener('input', (e) => {
  const k = e.target.dataset.k;
  if (!k) return;
  items[Number(e.target.dataset.i)][k] = e.target.value;
  refresh();
});
$('items').addEventListener('click', (e) => {
  if (e.target.dataset.remove !== undefined) {
    items.splice(Number(e.target.dataset.remove), 1);
    drawItems();
    refresh();
  }
});
$('addItem').addEventListener('click', () => { items.push(newItem()); drawItems(); refresh(); });

/* ---------- data + totals ---------- */
function getData() {
  const rows = items
    .filter((r) => r.item.trim() || r.desc.trim())
    .map((r) => {
      const qty = Number(r.qty) || 0;
      const price = Number(r.price) || 0;
      return { item: r.item.trim(), desc: r.desc.trim(), qty, price, amount: qty * price };
    });
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return { client: $('client').value.trim(), date: $('date').value, due: $('due').value, notes: $('notes').value.trim(), rows, total };
}

/* ---------- shared letterhead (invoice + receipt) ---------- */
function headerHtml(type, metaRows) {
  const c = CONFIG.COMPANY;
  const logo = logoSrc ? `<img src="${esc(logoSrc)}" alt="" onerror="this.remove()">` : '';
  const meta = metaRows.map((m) => `<tr><td>${esc(m[0])}</td><td>${esc(m[1])}</td></tr>`).join('');
  return `
    <div class="doc-stripe"></div>
    <div class="doc-head">
      <div class="doc-brand">
        ${logo}
        <div>
          <div class="name">${esc(c.name)}</div>
          <div class="loc">${esc(c.location)}</div>
          <div class="ct">${esc(c.phones)}<br>${esc(c.email)}</div>
        </div>
      </div>
      <div class="doc-id">
        <div class="type">${esc(type)}</div>
        <table class="doc-meta">${meta}</table>
      </div>
    </div>
    <div class="doc-rule"></div>`;
}

/* ---------- invoice preview ---------- */
function renderInvoice(invoiceNo, opts) {
  const d = (opts && opts.data) || getData();
  const sigUrl = opts && opts.signature;
  const rowsHtml = d.rows.length ? d.rows.map((r, i) => `
    <tr>
      <td class="c" style="width:40px">${pad(i + 1)}</td>
      <td style="width:120px">${esc(r.item)}</td>
      <td>${esc(r.desc)}</td>
      <td class="c" style="width:56px">${r.qty}</td>
      <td class="num" style="width:106px">${money(r.price)}</td>
      <td class="num" style="width:112px">${money(r.amount)}</td>
    </tr>`).join('') : `<tr><td colspan="6" class="empty-row">Items you add will appear here</td></tr>`;

  const issuer = session && session.user ? session.user.name : '';
  const services = CONFIG.SERVICES.split('/').map((x) => esc(x.trim())).join(' &nbsp;•&nbsp; ');
  const payLines = CONFIG.PAYMENT_DETAILS ? `<div class="dk">Payment details</div><div>${esc(CONFIG.PAYMENT_DETAILS)}</div>` : '';
  const dueText = d.due ? prettyDate(d.due) : 'On receipt';

  $('invoice').innerHTML = `
    ${headerHtml('INVOICE', [
      ['Invoice No', invoiceNo || 'Assigned on generate'],
      ['Date', prettyDate(d.date)],
      ['Due date', dueText]
    ])}
    <div class="svc">${services}</div>

    <div class="bill">
      <div>
        <div class="dk">Bill to</div>
        <div class="who${d.client ? '' : ' ph'}">${esc(d.client || 'Client name')}</div>
      </div>
      <div class="due-box">
        <div class="dk">Amount due</div>
        <div class="amt">${money(d.total)}</div>
        <div class="dd">Due: ${esc(dueText)}</div>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th class="c" style="width:40px">#</th><th style="width:120px">Item</th><th>Description</th>
          <th class="c" style="width:56px">Qty</th><th class="num" style="width:106px">Unit price</th><th class="num" style="width:112px">Amount</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="sum">
      <div class="sum-left">
        <div class="dk">Amount in words</div>
        <div class="words">${d.total > 0 ? esc(amountWords(d.total)) : '—'}</div>
        ${d.notes ? `<div class="dk" style="margin-top:12px">Notes</div><div class="notes">${esc(d.notes).replace(/\n/g, '<br>')}</div>` : ''}
      </div>
      <div class="totals">
        <div class="row"><span>Sub-total</span><span>${money(d.total)}</span></div>
        <div class="row grand"><span>Total due</span><span>${money(d.total)}</span></div>
      </div>
    </div>

    <div class="doc-foot">
      <div class="terms">
        ${payLines}
        <div class="dk">Terms</div>
        <div>${esc(CONFIG.TERMS)}</div>
      </div>
      <div class="sigs">
        <div>Issued by${issuer ? ': <b>' + esc(issuer) + '</b>' : ''}</div>
        <div>${sigUrl ? `<span class="sig-img"><img src="${esc(sigUrl)}" alt=""></span>` : ''}Authorised signature &amp; stamp${sigUrl ? `<span class="sig-date">Signed ${esc(prettyDate(todayISO()))}</span>` : ''}</div>
      </div>
      <div class="thanks">${esc(CONFIG.THANKS)}</div>
    </div>
  `;
  return d;
}

function refresh() {
  $('totalLabel').textContent = money(getData().total);
  renderInvoice(null);
}

/* ---------- logo (embedded so it always appears in PDFs) ---------- */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
async function prepareLogo() {
  if (window.LOGO_DATA) { logoSrc = window.LOGO_DATA; return; }   // from logo.js: works everywhere, even a local file
  try {
    const res = await fetch(CONFIG.LOGO, { cache: 'force-cache' });
    if (!res.ok) { logoSrc = ''; return; }          // logo.png not found: show the name only
    logoSrc = await blobToDataUrl(await res.blob());
  } catch (e) {
    logoSrc = '';   // opened as a local file: a plain image path would taint the PDF canvas, so use logo.js (see make-logo.html)
  }
}

/* ---------- Apps Script API ---------- */
async function post(payload) {
  if (!CONFIG.SCRIPT_URL || CONFIG.SCRIPT_URL.startsWith('PASTE')) {
    throw new Error('Add your Apps Script Web App URL in script.js first.');
  }
  // text/plain avoids the CORS preflight that Apps Script does not support
  const res = await fetch(CONFIG.SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  let out;
  try { out = await res.json(); } catch (e) { throw new Error('Unexpected reply from the server. Check that the Web App is deployed with access set to "Anyone".'); }
  return out;
}

async function api(payload) {
  if (!session) throw new Error('Please sign in.');
  const out = await post(Object.assign({ token: session.token }, payload));
  if (out.authRequired) {
    signOut('Your session has ended. Please sign in again.');
    throw new Error('Your session has ended. Please sign in again.');
  }
  if (!out.ok) throw new Error(out.error || 'Request failed');
  return out;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---------- generate invoice ---------- */
function makeInvoicePdf(fileName) {
  return html2pdf().set({
    margin: 0,
    filename: fileName,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.sum', '.doc-foot'] }
  }).from($('invoice')).outputPdf('blob');
}

async function generate() {
  const d = getData();

  if (!d.client) return setStatus('Enter the client name.', 'error');
  if (!d.date) return setStatus('Choose the invoice date.', 'error');
  if (!d.rows.length) return setStatus('Add at least one item.', 'error');
  if (d.due && d.due < d.date) return setStatus('The due date is before the invoice date.', 'error');

  const btn = $('generate');
  btn.disabled = true;
  $('result').classList.remove('show');
  $('driveLink').style.display = 'none';
  lastGen = null; lastBlob = null;

  try {
    // an invoice cannot be created or downloaded until it is signed
    setStatus('Sign the invoice to continue…');
    const sig = await getSignature('Sign to create this invoice');
    if (!sig) return setStatus('The invoice was not created. It has to be signed first.', 'error');

    setStatus('Getting the invoice number…');
    const summary = d.rows.map((r) => `${r.item || r.desc} x${r.qty}`).join('; ');
    const reserved = await api({ action: 'reserve', client: d.client, date: d.date, dueDate: d.due, total: d.total, summary });
    const invoiceNo = reserved.invoiceNo;
    lastGen = {
      invoiceNo, data: d, signature: sig,
      fileName: `Invoice ${invoiceNo} - ${d.client}.pdf`.replace(/[\\/:*?"<>|]/g, '')
    };
    await finishInvoice();
  } catch (err) {
    setStatus(err.message, 'error');
    if (lastGen && !lastBlob) showResult(true);   // number issued but the PDF failed: offer a retry (no new number, no new signature)
  } finally {
    btn.disabled = false;
  }
}

function showResult(retry) {
  $('retryBtn').hidden = !retry;
  $('downloadBtn').hidden = retry;
  $('printBtn').hidden = retry;
  $('result').classList.add('show');
}

// builds the signed PDF, downloads it once and saves a copy to Drive
async function finishInvoice() {
  const gen = lastGen;
  renderInvoice(gen.invoiceNo, { data: gen.data, signature: gen.signature });
  lastFileName = gen.fileName;

  setStatus('Creating the signed PDF…');
  lastBlob = await makeInvoicePdf(lastFileName);
  downloadBlob(lastBlob, lastFileName);

  setStatus('Saving a copy to Google Drive…');
  try {
    const pdfBase64 = await blobToBase64(lastBlob);
    const saved = await api({ action: 'savePdf', invoiceNo: gen.invoiceNo, fileName: lastFileName, pdfBase64, signed: true });
    $('driveLink').href = saved.url;
    $('driveLink').style.display = '';
    setStatus(`${gen.invoiceNo} signed and created. It is saved to Drive and listed as Unpaid under Invoices.`, 'ok');
  } catch (err) {
    setStatus(`${gen.invoiceNo} signed and downloaded, but the Drive copy failed: ${err.message}`, 'error');
  }
  showResult(false);
}

/* ================= INVOICES (tracking) ================= */

// Paid / Partial / Unpaid / Cancelled, plus "Overdue" when unpaid past its due date
function displayStatus(inv) {
  if (inv.status === 'Cancelled') return 'Cancelled';
  if (inv.status === 'Paid') return 'Paid';
  if (inv.due && inv.due < todayISO()) return 'Overdue';
  return inv.status === 'Partial' ? 'Partial' : 'Unpaid';
}
function numOf(no) { return parseInt(String(no).replace(/\D/g, ''), 10) || 0; }

function renderTrack() {
  const live = invoices.filter((i) => i.status !== 'Cancelled');
  const overdue = live.filter((i) => displayStatus(i) === 'Overdue');

  $('sInvoiced').textContent = money(sum(live, 'total'));
  $('sInvoicedN').textContent = live.length + ' invoice' + (live.length === 1 ? '' : 's');
  $('sPaid').textContent = money(sum(live, 'paid'));
  $('sPaidN').textContent = live.filter((i) => i.status === 'Paid').length + ' fully paid';
  const outstanding = live.filter((i) => i.status !== 'Paid');
  $('sOut').textContent = money(sum(outstanding, 'balance'));
  $('sOutN').textContent = outstanding.length + ' not fully paid';
  $('sOver').textContent = money(sum(overdue, 'balance'));
  $('sOverN').textContent = overdue.length + ' past due date';

  const q = $('search').value.trim().toLowerCase();
  const list = invoices
    .filter((i) => {
      const s = displayStatus(i);
      if (filter === 'outstanding' && !(i.status === 'Unpaid' || i.status === 'Partial')) return false;
      if (filter === 'paid' && i.status !== 'Paid') return false;
      if (filter === 'overdue' && s !== 'Overdue') return false;
      if (filter === 'cancelled' && i.status !== 'Cancelled') return false;
      if (q && !(i.no.toLowerCase().includes(q) || i.client.toLowerCase().includes(q))) return false;
      return true;
    })
    .sort((a, b) => numOf(b.no) - numOf(a.no));

  if (!list.length) {
    $('invBody').innerHTML = `<tr><td colspan="8" class="empty">${invoices.length ? 'No invoices match this filter.' : 'No invoices yet. Create one under New invoice.'}</td></tr>`;
    return;
  }

  $('invBody').innerHTML = list.map((i) => {
    const s = displayStatus(i);
    const canPay = i.status === 'Unpaid' || i.status === 'Partial';
    return `
      <tr>
        <td><b>${esc(i.no)}</b><span class="sub">${esc(shortDate(i.date))}</span></td>
        <td class="client">${esc(i.client)}<span class="sub">${esc(i.items)}</span></td>
        <td>${i.due ? esc(shortDate(i.due)) : '<span class="sub">—</span>'}</td>
        <td class="num">${money(i.total)}</td>
        <td class="num">${money(i.paid)}${i.lastPay ? `<span class="sub">${esc(shortDate(i.lastPay))}${i.method ? ' · ' + esc(i.method) : ''}</span>` : ''}</td>
        <td class="num">${i.status === 'Cancelled' ? '—' : money(i.balance)}</td>
        <td><span class="pill ${s.toLowerCase()}">${s}</span></td>
        <td><div class="acts">
          ${canPay ? `<button type="button" class="pay" data-act="pay" data-no="${esc(i.no)}">Record payment</button>` : ''}
          ${i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener">PDF</a>` : ''}
          ${i.status === 'Cancelled'
            ? `<button type="button" data-act="reopen" data-no="${esc(i.no)}">Reopen</button>`
            : (i.status !== 'Paid' ? `<button type="button" data-act="cancel" data-no="${esc(i.no)}">Cancel</button>` : '')}
        </div></td>
      </tr>`;
  }).join('');
}

$('chips').addEventListener('click', (e) => {
  if (!e.target.dataset.f) return;
  filter = e.target.dataset.f;
  document.querySelectorAll('#chips button').forEach((b) => b.classList.toggle('active', b.dataset.f === filter));
  renderTrack();
});
$('search').addEventListener('input', renderTrack);

$('invBody').addEventListener('click', async (e) => {
  const act = e.target.dataset.act;
  if (!act) return;
  const inv = invoices.find((i) => i.no === e.target.dataset.no);
  if (!inv) return;

  if (act === 'pay') return openPayDialog(inv);

  if (act === 'cancel' || act === 'reopen') {
    const msg = act === 'cancel'
      ? `Cancel invoice ${inv.no}? It stays on record but no longer counts as money owed.`
      : `Reopen invoice ${inv.no}?`;
    if (!confirm(msg)) return;
    try {
      setMsg($('trackStatus'), 'Updating…');
      await api({ action: 'setCancelled', invoiceNo: inv.no, cancelled: act === 'cancel' });
      await reloadCurrent();
    } catch (err) {
      setMsg($('trackStatus'), err.message, 'error');
    }
  }
});

/* ---- payment dialog ---- */
function openPayDialog(inv) {
  payingNo = inv.no;
  $('payTitle').textContent = `Record payment for ${inv.no}`;
  $('payInfo').textContent = `${inv.client} · Total ${money(inv.total)} · Paid ${money(inv.paid)} · Balance ${money(inv.balance)}`;
  $('payAmount').value = inv.balance;
  $('payDate').value = todayISO();
  $('payMethod').selectedIndex = 0;
  $('payNote').value = '';
  $('payError').textContent = '';
  $('payDialog').showModal();
}
$('payCancel').addEventListener('click', () => $('payDialog').close());

$('paySave').addEventListener('click', async () => {
  const amount = Number($('payAmount').value);
  if (!(amount > 0)) { $('payError').textContent = 'Enter the amount received.'; return; }
  if (!$('payDate').value) { $('payError').textContent = 'Choose the payment date.'; return; }

  // a receipt cannot be issued or downloaded until it is signed
  const sig = await getSignature('Sign to issue the receipt');
  if (!sig) { $('payError').textContent = 'The receipt has to be signed before it is issued.'; return; }

  const btn = $('paySave');
  btn.disabled = true;
  $('payError').textContent = '';
  try {
    const out = await api({
      action: 'recordPayment',
      invoiceNo: payingNo,
      amount,
      date: $('payDate').value,
      method: $('payMethod').value,
      note: $('payNote').value.trim()
    });
    $('payDialog').close();
    issueReceipt(out.receipt, { signature: sig }); // builds the signed PDF, downloads it once and saves a copy to Drive
  } catch (err) {
    $('payError').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

/* ================= RECEIPTS ================= */

function renderReceipt(p, sigUrl) {
  const full = p.balanceAfter <= 0.005;
  $('receipt').innerHTML = `
    ${headerHtml('RECEIPT', [
      ['Receipt No', p.receiptNo],
      ['Date', prettyDate(p.date)],
      ['Invoice', p.invoiceNo]
    ])}
    <div class="rc-rows">
      <div class="rc-row"><div class="k2">Received from</div><div class="v">${esc(p.client)}</div></div>
      <div class="rc-row"><div class="k2">The sum of</div><div class="v">${esc(amountWords(p.amount))}</div></div>
      <div class="rc-row"><div class="k2">Being payment for</div><div class="v">Invoice ${esc(p.invoiceNo)}${p.note ? ' (' + esc(p.note) + ')' : ''}</div></div>
      <div class="rc-row"><div class="k2">Payment method</div><div class="v">${esc(p.method || '—')}</div></div>
    </div>
    <div class="rc-bottom">
      <div class="rc-amount"><div class="lbl">Amount received</div><div class="big">${money(p.amount)}</div></div>
      <table class="rc-sum">
        <tr><td>Invoice total</td><td>${money(p.invoiceTotal)}</td></tr>
        <tr><td>Paid to date</td><td>${money(p.paidToDate)}</td></tr>
        <tr><td><b>Balance</b></td><td><b>${money(p.balanceAfter)}</b></td></tr>
      </table>
    </div>
    <div class="rc-stamp">${full ? '<span class="full">PAID IN FULL</span>' : '<span class="part">PART PAYMENT</span>'}</div>
    <div class="rc-thanks">${esc(CONFIG.THANKS)}</div>
    <div class="rc-sign">
      <div>Received by${p.recordedBy ? ': <b>' + esc(p.recordedBy) + '</b>' : ' (name)'}</div>
      <div>${sigUrl ? `<span class="sig-img"><img src="${esc(sigUrl)}" alt=""></span>` : ''}Signature &amp; stamp${sigUrl ? `<span class="sig-date">Signed ${esc(prettyDate(todayISO()))}</span>` : ''}</div>
    </div>
  `;
}

function buildReceiptPdf(p, sigUrl) {
  renderReceipt(p, sigUrl);
  return html2pdf().set({
    margin: 0,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
    jsPDF: { unit: 'mm', format: 'a5', orientation: 'landscape' }
  }).from($('receipt')).outputPdf('blob');
}

function setRc(msg, type) { const el = $('rcStatus'); el.textContent = msg || ''; el.className = type || ''; }

async function issueReceipt(p, opts) {
  let sigUrl = (opts && opts.signature) || null;
  if (!sigUrl) {                                   // e.g. a receipt that was recorded but never signed
    sigUrl = await getSignature('Sign receipt ' + p.receiptNo);
    if (!sigUrl) return;
  }
  rc = { p, blob: null, name: '' };
  $('rcTitle').textContent = `Receipt ${p.receiptNo}`;
  $('rcInfo').textContent = `${p.client} · ${money(p.amount)} for invoice ${p.invoiceNo}`;
  $('rcBtns').hidden = true;
  $('rcBtnsBusy').hidden = false;
  $('rcDrive').hidden = true;
  setRc('Creating the signed receipt PDF…');
  if (!$('rcDialog').open) $('rcDialog').showModal();

  try {
    rc.name = `Receipt ${p.receiptNo} - ${p.client}.pdf`.replace(/[\\/:*?"<>|]/g, '');
    rc.blob = await buildReceiptPdf(p, sigUrl);
    downloadBlob(rc.blob, rc.name);
    $('rcBtns').hidden = false;
    $('rcBtnsBusy').hidden = true;

    setRc('Saving a copy to Google Drive…');
    try {
      const pdfBase64 = await blobToBase64(rc.blob);
      const saved = await api({ action: 'saveReceiptPdf', receiptNo: p.receiptNo, fileName: rc.name, pdfBase64, signed: true });
      $('rcDrive').href = saved.url;
      $('rcDrive').hidden = false;
      setRc('Signed receipt saved to Drive.', 'ok');
    } catch (err) {
      setRc('Receipt downloaded, but the Drive copy failed: ' + err.message, 'error');
    }
  } catch (err) {
    setRc(err.message, 'error');
  }
}

function closeRc() { $('rcDialog').close(); reloadCurrent(); }
$('rcClose').addEventListener('click', closeRc);
$('rcCloseBusy').addEventListener('click', closeRc);
$('rcDownload').addEventListener('click', () => rc.blob && downloadBlob(rc.blob, rc.name));
$('rcOpen').addEventListener('click', () => {
  if (!rc.blob) return;
  window.open(URL.createObjectURL(rc.blob), '_blank');
});

function renderReceipts() {
  const monthKey = todayISO().slice(0, 7);
  const thisMonth = payments.filter((p) => p.date && p.date.slice(0, 7) === monthKey);
  const unsigned = payments.filter((p) => !p.signed).length;

  $('rCount').textContent = payments.length;
  $('rCountS').textContent = unsigned ? unsigned + ' not signed yet' : 'all signed';
  $('rTotal').textContent = money(sum(payments, 'amount'));
  $('rTotalS').textContent = 'across ' + new Set(payments.map((p) => p.invoiceNo)).size + ' invoices';
  $('rMonth').textContent = money(sum(thisMonth, 'amount'));
  $('rMonthS').textContent = thisMonth.length + ' payment' + (thisMonth.length === 1 ? '' : 's');

  const q = $('rSearch').value.trim().toLowerCase();
  const list = payments
    .filter((p) => !q || p.receiptNo.toLowerCase().includes(q) || p.invoiceNo.toLowerCase().includes(q) || p.client.toLowerCase().includes(q))
    .sort((a, b) => numOf(b.receiptNo) - numOf(a.receiptNo));

  if (!list.length) {
    $('rcBody').innerHTML = `<tr><td colspan="7" class="empty">${payments.length ? 'No receipts match your search.' : 'No receipts yet. Record a payment under Invoices to issue one.'}</td></tr>`;
    return;
  }

  $('rcBody').innerHTML = list.map((p) => `
    <tr>
      <td><b>${esc(p.receiptNo)}</b><span class="sub">${esc(shortDate(p.date))}${p.signed ? ' · signed' : ''}</span></td>
      <td>${esc(p.invoiceNo)}</td>
      <td class="client">${esc(p.client)}${p.note ? `<span class="sub">${esc(p.note)}</span>` : ''}</td>
      <td class="num">${money(p.amount)}</td>
      <td class="num">${money(p.balanceAfter)}${p.balanceAfter <= 0.005 ? '<span class="sub">paid in full</span>' : ''}</td>
      <td>${esc(p.method || '—')}</td>
      <td><div class="acts">
        ${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">PDF</a>` : ''}
        ${p.signed ? '' : `<button type="button" class="pay" data-act="make" data-no="${esc(p.receiptNo)}">Sign &amp; create PDF</button>`}
      </div></td>
    </tr>`).join('');
}
$('rSearch').addEventListener('input', renderReceipts);
$('rcBody').addEventListener('click', (e) => {
  if (e.target.dataset.act !== 'make') return;
  const p = payments.find((x) => x.receiptNo === e.target.dataset.no);
  if (p) issueReceipt(p);   // asks for the signature first
});

/* ================= OVERVIEW ================= */

function periodStart(p) {
  const d = new Date();
  if (p === 'all') return '';
  if (p === 'year') return `${d.getFullYear()}-01-01`;
  if (p === 'month') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
  d.setDate(d.getDate() - (p === 'd30' ? 30 : 90));
  return isoOf(d);
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

const COLORS = { paid: '#1f9d4a', partial: '#e0a100', unpaid: '#e8776b', overdue: '#c8102e', cancelled: '#9aa3b2', navy: '#12306b' };

function renderOverview() {
  if (typeof Chart !== 'undefined') Chart.defaults.font.family = '"Segoe UI", Calibri, Arial, sans-serif';

  const start = periodStart($('ovPeriod').value);
  const inRange = (dt) => !start || (dt && dt >= start);
  const invs = invoices.filter((i) => inRange(i.date));
  const live = invs.filter((i) => i.status !== 'Cancelled');
  const pays = payments.filter((p) => inRange(p.date));

  /* ---- KPI cards ---- */
  const invoiced = sum(live, 'total');
  const collected = sum(live, 'paid');
  const owed = sum(live, 'balance');
  const overdue = live.filter((i) => displayStatus(i) === 'Overdue');
  const overdueAmt = sum(overdue, 'balance');
  const paidInv = live.filter((i) => i.status === 'Paid');
  const dayList = paidInv.filter((i) => i.lastPay && i.date).map((i) => Math.max(0, daysBetween(i.date, i.lastPay)));
  const avgDays = dayList.length ? Math.round(dayList.reduce((a, b) => a + b, 0) / dayList.length) : null;

  $('ovCards').innerHTML = `
    <div class="card"><div class="k">Total invoiced</div><div class="v">${moneyC(invoiced)}</div><div class="s">${live.length} invoice${live.length === 1 ? '' : 's'}${invs.length - live.length ? ' (' + (invs.length - live.length) + ' cancelled excluded)' : ''}</div></div>
    <div class="card green"><div class="k">Collected</div><div class="v">${moneyC(collected)}</div><div class="s">${pct(collected, invoiced)} of invoiced · ${paidInv.length} of ${live.length} fully paid</div></div>
    <div class="card"><div class="k">Outstanding</div><div class="v">${moneyC(owed)}</div><div class="s">${pct(owed, invoiced)} of invoiced</div></div>
    <div class="card red"><div class="k">Overdue</div><div class="v">${moneyC(overdueAmt)}</div><div class="s">${overdue.length} invoice${overdue.length === 1 ? '' : 's'} · ${pct(overdueAmt, owed)} of outstanding</div></div>
    <div class="card"><div class="k">Average invoice</div><div class="v">${live.length ? moneyC(invoiced / live.length) : '—'}</div><div class="s">${live.length ? 'largest ' + moneyC(Math.max.apply(null, live.map((i) => i.total))) : 'no invoices'}</div></div>
    <div class="card"><div class="k">Average time to get paid</div><div class="v">${avgDays === null ? '—' : avgDays + ' day' + (avgDays === 1 ? '' : 's')}</div><div class="s">${dayList.length ? 'from ' + dayList.length + ' fully paid invoice' + (dayList.length === 1 ? '' : 's') : 'no fully paid invoices yet'}</div></div>
  `;

  /* ---- monthly: invoiced vs received ---- */
  const invByM = {};
  const recByM = {};
  live.forEach((i) => { if (i.date) { const k = i.date.slice(0, 7); invByM[k] = (invByM[k] || 0) + i.total; } });
  pays.forEach((p) => { if (p.date) { const k = p.date.slice(0, 7); recByM[k] = (recByM[k] || 0) + p.amount; } });
  const keys = Object.keys(invByM).concat(Object.keys(recByM)).sort();
  let months = [];
  if (keys.length) {
    const nowKey = todayISO().slice(0, 7);
    let [y, m] = keys[0].split('-').map(Number);
    const [ey, em] = (keys[keys.length - 1] > nowKey ? keys[keys.length - 1] : nowKey).split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
      months.push(y + '-' + pad(m));
      m++; if (m > 12) { m = 1; y++; }
    }
    if (months.length > 36) months = months.slice(-36);
  }
  const monthLabel = (k) => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }); };
  mkChart('chMonthly', months.length > 0, {
    type: 'bar',
    data: {
      labels: months.map(monthLabel),
      datasets: [
        { label: 'Invoiced', data: months.map((k) => invByM[k] || 0), backgroundColor: COLORS.navy, borderRadius: 3 },
        { label: 'Received', data: months.map((k) => recByM[k] || 0), backgroundColor: COLORS.paid, borderRadius: 3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${moneyC(c.parsed.y)}` } } },
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => moneyC(v) } } }
    }
  });

  /* ---- status doughnut ---- */
  const counts = { Paid: 0, Partial: 0, Unpaid: 0, Overdue: 0, Cancelled: 0 };
  invs.forEach((i) => { counts[displayStatus(i)]++; });
  const sKeys = Object.keys(counts).filter((k) => counts[k] > 0);
  const sTotal = invs.length;
  mkChart('chStatus', sTotal > 0, {
    type: 'doughnut',
    data: {
      labels: sKeys.map((k) => `${k} · ${counts[k]} (${pct(counts[k], sTotal)})`),
      datasets: [{ data: sKeys.map((k) => counts[k]), backgroundColor: sKeys.map((k) => COLORS[k.toLowerCase()]), borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: (c) => ' ' + c.label } } }
    }
  });

  /* ---- payment methods doughnut ---- */
  const byMethod = {};
  pays.forEach((p) => { const k = p.method || 'Not stated'; byMethod[k] = (byMethod[k] || 0) + p.amount; });
  const mKeys = Object.keys(byMethod).sort((a, b) => byMethod[b] - byMethod[a]);
  const mTotal = sum(pays, 'amount');
  const mColors = ['#12306b', '#1f9d4a', '#e0a100', '#7a5af8', '#e8776b', '#9aa3b2'];
  mkChart('chMethods', mKeys.length > 0, {
    type: 'doughnut',
    data: {
      labels: mKeys.map((k) => `${k} · ${moneyC(byMethod[k])} (${pct(byMethod[k], mTotal)})`),
      datasets: [{ data: mKeys.map((k) => byMethod[k]), backgroundColor: mKeys.map((k, i) => mColors[i % mColors.length]), borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: (c) => ' ' + c.label } } }
    }
  });

  /* ---- top clients (stacked: paid + still owed) ---- */
  const byClient = {};
  live.forEach((i) => {
    const key = i.client.trim().toLowerCase();
    if (!byClient[key]) byClient[key] = { name: i.client.trim(), total: 0, paid: 0 };
    byClient[key].total += i.total;
    byClient[key].paid += i.paid;
  });
  const top = Object.values(byClient).sort((a, b) => b.total - a.total).slice(0, 6);
  const cut = (s) => (s.length > 20 ? s.slice(0, 19) + '…' : s);
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
      plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${moneyC(c.parsed.x)}` } } },
      scales: { x: { stacked: true, beginAtZero: true, ticks: { callback: (v) => moneyC(v) } }, y: { stacked: true } }
    }
  });

  /* ---- ageing of unpaid balances (all invoices, not period-limited) ---- */
  const buckets = [0, 0, 0, 0];
  const today = todayISO();
  invoices.filter((i) => (i.status === 'Unpaid' || i.status === 'Partial') && i.balance > 0 && i.date).forEach((i) => {
    const age = daysBetween(i.date, today);
    buckets[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3] += i.balance;
  });
  const bTotal = buckets.reduce((a, b) => a + b, 0);
  const bNames = ['0–30 days', '31–60 days', '61–90 days', 'Over 90 days'];
  mkChart('chAgeing', bTotal > 0, {
    type: 'bar',
    data: {
      labels: bNames.map((n, i) => `${n} · ${pct(buckets[i], bTotal)}`),
      datasets: [{ data: buckets, backgroundColor: ['#e0a100', '#e8963a', '#e8776b', '#c8102e'], borderRadius: 3 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + moneyC(c.parsed.y) } } },
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => moneyC(v) } } }
    }
  });
}
$('ovPeriod').addEventListener('change', renderOverview);

/* ---------- buttons (new invoice) ---------- */
$('generate').addEventListener('click', generate);
$('downloadBtn').addEventListener('click', () => lastBlob && downloadBlob(lastBlob, lastFileName));
$('printBtn').addEventListener('click', () => {
  if (!lastGen || !lastBlob) return;   // only a signed invoice can be printed
  renderInvoice(lastGen.invoiceNo, { data: lastGen.data, signature: lastGen.signature });
  window.print();
});
$('retryBtn').addEventListener('click', async () => {
  if (!lastGen) return;
  $('retryBtn').disabled = true;
  try { await finishInvoice(); } catch (err) { setStatus(err.message, 'error'); showResult(true); }
  $('retryBtn').disabled = false;
});
$('newBtn').addEventListener('click', () => {
  $('client').value = '';
  $('date').value = todayISO();
  $('due').value = '';
  $('notes').value = '';
  items = [newItem()];
  lastBlob = null;
  lastGen = null;
  $('result').classList.remove('show');
  $('retryBtn').hidden = true;
  setStatus('');
  drawItems();
  refresh();
});
$('client').addEventListener('input', refresh);
$('date').addEventListener('input', refresh);
$('due').addEventListener('input', refresh);
$('notes').addEventListener('input', refresh);

/* ================= SIGNATURES ================= */
/* A signature is a transparent PNG (drawn, uploaded or generated from a name) placed above the signature line. */

const SIG_FONTS = ['Dancing Script', 'Great Vibes', 'Allura', 'Caveat'];
const sg = { tab: 'draw', ink: '#0b1f4d', strokes: [], cur: null, upload: null, font: SIG_FONTS[0], resolve: null };
const sgCanvas = $('sgCanvas');
const sgCtx = sgCanvas.getContext('2d');

const sgKey = () => 'inv_sig:' + (session && session.user ? session.user.username : '');
function sgLoadSaved() { try { return localStorage.getItem(sgKey()) || ''; } catch (e) { return ''; } }
function sgStore(url) { try { localStorage.setItem(sgKey(), url); } catch (e) { /* storage blocked */ } }
function sgForget() { try { localStorage.removeItem(sgKey()); } catch (e) { /* ignore */ } }

/* ---- drawing pad ---- */
function sgDrawStroke(ctx, st) {
  const pts = st.pts;
  if (!pts.length) return;
  ctx.strokeStyle = st.ink; ctx.fillStyle = st.ink;
  ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (pts.length < 3) {
    ctx.arc(pts[0].x, pts[0].y, 2.5, 0, Math.PI * 2); ctx.fill();
    if (pts.length === 2) { ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke(); }
    return;
  }
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.stroke();
}
function sgRedraw() {
  sgCtx.clearRect(0, 0, sgCanvas.width, sgCanvas.height);
  sg.strokes.forEach((st) => sgDrawStroke(sgCtx, st));
}
function sgPoint(e) {
  const r = sgCanvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (sgCanvas.width / r.width), y: (e.clientY - r.top) * (sgCanvas.height / r.height) };
}
sgCanvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  $('sgError').textContent = '';
  sgCanvas.setPointerCapture(e.pointerId);
  sg.cur = { ink: sg.ink, pts: [sgPoint(e)] };
  sg.strokes.push(sg.cur);
  sgRedraw();
});
sgCanvas.addEventListener('pointermove', (e) => {
  if (!sg.cur) return;
  sg.cur.pts.push(sgPoint(e));
  sgRedraw();
});
['pointerup', 'pointercancel'].forEach((ev) => sgCanvas.addEventListener(ev, () => { sg.cur = null; }));
$('sgUndo').addEventListener('click', () => { sg.strokes.pop(); sgRedraw(); });
$('sgClear').addEventListener('click', () => { sg.strokes = []; sgRedraw(); });

/* ---- turning any canvas into a tight, transparent PNG ---- */
function sgTrim(src) {
  const w = src.width, h = src.height;
  const px = src.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;                                  // nothing visible
  const m = 8;
  const cw = x1 - x0 + 1 + m * 2, ch = y1 - y0 + 1 + m * 2;
  const k = Math.min(1, 800 / cw, 300 / ch);                // keep the file small
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(cw * k)); out.height = Math.max(1, Math.round(ch * k));
  out.getContext('2d').drawImage(src, x0 - m, y0 - m, cw, ch, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

/* ---- upload ---- */
function sgFromImage(img, removeBg) {
  const k = Math.min(1, 1000 / img.width, 400 / img.height);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  if (removeBg) {
    const id = ctx.getImageData(0, 0, c.width, c.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const a = lum > 235 ? 0 : lum > 190 ? Math.round(((235 - lum) / 45) * 255) : 255;
      d[i + 3] = Math.min(d[i + 3], a);
    }
    ctx.putImageData(id, 0, 0);
  }
  return c;
}
function sgUploadPreview() {
  if (!sg.upload) { $('sgUpPrev').textContent = 'Your uploaded signature appears here'; return; }
  const url = sgTrim(sgFromImage(sg.upload, $('sgRemoveBg').checked));
  $('sgUpPrev').innerHTML = url ? `<img src="${url}" alt="">` : 'No signature found in that image.';
}
$('sgFile').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (!/^image\//.test(f.type)) { $('sgError').textContent = 'Please choose an image file (PNG or JPG).'; return; }
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => { sg.upload = img; $('sgError').textContent = ''; sgUploadPreview(); };
    img.onerror = () => { $('sgError').textContent = 'That image could not be read.'; };
    img.src = String(r.result);
  };
  r.readAsDataURL(f);
});
$('sgRemoveBg').addEventListener('change', sgUploadPreview);

/* ---- from name ---- */
async function sgFromText(text, font, ink) {
  const size = 120;
  try { await document.fonts.load(`${size}px "${font}"`, text); } catch (e) { /* fall back to cursive */ }
  const c = document.createElement('canvas');
  const fontCss = `${size}px "${font}", cursive`;
  c.getContext('2d').font = fontCss;
  const w = Math.ceil(c.getContext('2d').measureText(text).width) + 100;
  c.width = w; c.height = size * 2;
  const ctx = c.getContext('2d');
  ctx.font = fontCss; ctx.fillStyle = ink; ctx.textBaseline = 'middle';
  ctx.fillText(text, 50, size);
  return c;
}
function sgDrawFontChoices() {
  const text = $('sgText').value.trim() || 'Your name';
  $('sgFonts').innerHTML = SIG_FONTS.map((f) => `
    <label class="${f === sg.font ? 'on' : ''}">
      <input type="radio" name="sgFont" value="${esc(f)}" ${f === sg.font ? 'checked' : ''}>
      <span style="font-family:'${esc(f)}',cursive;color:${sg.ink}">${esc(text)}</span>
    </label>`).join('');
}
$('sgText').addEventListener('input', sgDrawFontChoices);
$('sgFonts').addEventListener('change', (e) => { if (e.target.name === 'sgFont') { sg.font = e.target.value; sgDrawFontChoices(); } });

/* ---- tabs + ink ---- */
function sgShowTab(tab) {
  sg.tab = tab;
  document.querySelectorAll('.sg-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.sg === tab));
  document.querySelectorAll('#sigDialog [data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
  $('sgInk').hidden = tab === 'upload';
  $('sgError').textContent = '';
  if (tab === 'type') sgDrawFontChoices();
}
document.querySelectorAll('.sg-tabs button').forEach((b) => b.addEventListener('click', () => sgShowTab(b.dataset.sg)));
$('sgInk').addEventListener('click', (e) => {
  const c = e.target.dataset.ink;
  if (!c) return;
  sg.ink = c;
  $('sgInk').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.ink === c));
  sg.strokes.forEach((st) => { st.ink = c; });               // recolour what is already drawn
  sgRedraw();
  sgDrawFontChoices();
});

/* ---- open / apply ---- */
function getSignature(title) {
  return new Promise((resolve) => {
    sg.resolve = resolve;
    $('sgTitle').textContent = title || 'Sign document';
    $('sgError').textContent = '';
    sg.strokes = []; sg.cur = null; sg.upload = null;
    sgRedraw();
    $('sgFile').value = '';
    sgUploadPreview();
    $('sgText').value = session && session.user ? session.user.name : '';
    const saved = sgLoadSaved();
    $('sgSaved').hidden = !saved;
    if (saved) $('sgSavedImg').src = saved;
    sgShowTab('draw');
    $('sigDialog').showModal();
  });
}
function sgFinish(url) {
  const done = sg.resolve;
  sg.resolve = null;
  if ($('sigDialog').open) $('sigDialog').close();
  if (done) done(url);
}
$('sigDialog').addEventListener('close', () => sgFinish(null));   // Esc or Cancel
$('sgCancel').addEventListener('click', () => sgFinish(null));
$('sgUseSaved').addEventListener('click', () => sgFinish(sgLoadSaved() || null));
$('sgForget').addEventListener('click', () => { sgForget(); $('sgSaved').hidden = true; });

$('sgApply').addEventListener('click', async () => {
  const err = (m) => { $('sgError').textContent = m; };
  let url = null;
  try {
    if (sg.tab === 'draw') {
      if (!sg.strokes.length) return err('Draw your signature in the box first.');
      url = sgTrim(sgCanvas);
    } else if (sg.tab === 'upload') {
      if (!sg.upload) return err('Choose an image of your signature first.');
      url = sgTrim(sgFromImage(sg.upload, $('sgRemoveBg').checked));
    } else {
      const text = $('sgText').value.trim();
      if (!text) return err('Type your name first.');
      url = sgTrim(await sgFromText(text, sg.font, sg.ink));
    }
  } catch (e) { return err('Could not create the signature: ' + e.message); }
  if (!url) return err('No signature was found. Please try again.');
  if ($('sgRemember').checked) sgStore(url);
  sgFinish(url);
});

/* ================= LOGIN / SESSION ================= */

function readStored() {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function storeSession(sess, keep) {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    (keep ? localStorage : sessionStorage).setItem(TOKEN_KEY, JSON.stringify(sess));
  } catch (e) { /* storage blocked: the session lasts until the page closes */ }
}
function isKept() { try { return !!localStorage.getItem(TOKEN_KEY); } catch (e) { return false; } }
function wipeStored() {
  try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
}

function showLogin(msg) {
  $('app').hidden = true;
  $('loginView').hidden = false;
  $('loginError').textContent = msg || '';
  $('loginPass').value = '';
  (($('loginUser').value ? $('loginPass') : $('loginUser'))).focus();
}
function showApp() {
  $('loginView').hidden = true;
  $('app').hidden = false;
  $('userName').textContent = session.user.name;
  showTab('new');
  refresh(); // puts the signed-in name on the invoice
}

function clearData() {
  invoices = []; payments = [];
  ['invBody', 'rcBody', 'ovCards'].forEach((id) => { $(id).innerHTML = ''; });
  Object.keys(charts).forEach((k) => { charts[k].destroy(); delete charts[k]; });
  lastBlob = null; lastGen = null; rc = { p: null, blob: null, name: '' };
}

function signOut(msg) {
  session = null;
  wipeStored();
  clearData();
  if ($('payDialog').open) $('payDialog').close();
  if ($('rcDialog').open) $('rcDialog').close();
  if ($('pwDialog').open) $('pwDialog').close();
  if ($('sigDialog').open) $('sigDialog').close();
  showLogin(msg);
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('loginBtn');
  const username = $('loginUser').value.trim();
  const password = $('loginPass').value;
  if (!username || !password) { $('loginError').textContent = 'Enter your username and password.'; return; }
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  $('loginError').textContent = '';
  try {
    const keep = $('loginKeep').checked;
    const out = await post({ action: 'login', username, password, remember: keep });
    if (!out.ok) throw new Error(out.error || 'Sign in failed');
    session = { token: out.token, user: out.user };
    storeSession(session, keep);
    $('loginPass').value = '';
    showApp();
  } catch (err) {
    $('loginError').textContent = err.message;
    $('loginPass').value = '';
    $('loginPass').focus();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

$('logoutBtn').addEventListener('click', () => signOut(''));

/* ---- change password ---- */
$('pwBtn').addEventListener('click', () => {
  ['pwOld', 'pwNew', 'pwNew2'].forEach((id) => { $(id).value = ''; });
  $('pwError').textContent = ''; $('pwError').className = '';
  $('pwDialog').showModal();
});
$('pwCancel').addEventListener('click', () => $('pwDialog').close());
$('pwSave').addEventListener('click', async () => {
  const oldPw = $('pwOld').value, newPw = $('pwNew').value, again = $('pwNew2').value;
  const err = (m) => { $('pwError').className = ''; $('pwError').textContent = m; };
  if (!oldPw) return err('Enter your current password.');
  if (newPw.length < 8) return err('The new password must be at least 8 characters.');
  if (newPw !== again) return err('The new passwords do not match.');
  const btn = $('pwSave');
  btn.disabled = true;
  try {
    const out = await api({ action: 'changePassword', oldPassword: oldPw, newPassword: newPw });
    session.token = out.token; // the old token stops working once the password changes
    storeSession(session, isKept());
    $('pwError').className = 'ok';
    $('pwError').textContent = 'Password changed.';
    setTimeout(() => { if ($('pwDialog').open) $('pwDialog').close(); }, 900);
  } catch (e2) {
    err(e2.message);
  } finally {
    btn.disabled = false;
  }
});

/* ---------- start ---------- */
(async function start() {
  try { localStorage.removeItem('inv_pin'); } catch (e) { /* ignore */ } // the old PIN is no longer used
  $('date').value = todayISO();
  items = [newItem()];
  drawItems();
  refresh();
  prepareLogo().then(refresh);

  const saved = readStored();
  if (!saved || !saved.token) { showLogin(''); return; }
  session = saved;
  try {
    const out = await api({ action: 'session' });   // confirms the saved sign-in is still valid
    session.user = out.user;
    showApp();
  } catch (err) {
    if (session) { session = null; showLogin(err.message); }   // e.g. offline: keep the saved sign-in so a reload can retry (expired sessions are handled by signOut)
  }
})();
