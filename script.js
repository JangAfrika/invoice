/* ============ SETTINGS (edit these) ============ */
const CONFIG = {
  // Paste your Apps Script Web App URL here (ends with /exec)
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbw5KlLtix_mmYJmb6hKDHH08lD5Jxt95s1eAEic3QZCn49vYDAiwzxQ8d_IeOshr_Ir/exec',

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
function renderInvoice(invoiceNo) {
  const d = getData();
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
        <div>Authorised signature &amp; stamp</div>
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

  try {
    setStatus('Getting the invoice number…');
    const summary = d.rows.map((r) => `${r.item || r.desc} x${r.qty}`).join('; ');
    const reserved = await api({ action: 'reserve', client: d.client, date: d.date, dueDate: d.due, total: d.total, summary });
    const invoiceNo = reserved.invoiceNo;

    renderInvoice(invoiceNo);
    lastFileName = `Invoice ${invoiceNo} - ${d.client}.pdf`.replace(/[\\/:*?"<>|]/g, '');

    setStatus('Creating the PDF…');
    lastBlob = await html2pdf().set({
      margin: 0,
      filename: lastFileName,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.sum', '.doc-foot'] }
    }).from($('invoice')).outputPdf('blob');

    downloadBlob(lastBlob, lastFileName);

    setStatus('Saving a copy to Google Drive…');
    try {
      const pdfBase64 = await blobToBase64(lastBlob);
      const saved = await api({ action: 'savePdf', invoiceNo, fileName: lastFileName, pdfBase64 });
      $('driveLink').href = saved.url;
      $('driveLink').style.display = '';
      setStatus(`${invoiceNo} created and saved to Drive. It is now listed as Unpaid under Invoices.`, 'ok');
    } catch (err) {
      setStatus(`${invoiceNo} downloaded, but the Drive copy failed: ${err.message}`, 'error');
    }
    $('result').classList.add('show');
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
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
    issueReceipt(out.receipt); // builds the PDF, downloads it and saves a copy to Drive
  } catch (err) {
    $('payError').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

/* ================= RECEIPTS ================= */

function renderReceipt(p) {
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
      <div>Signature &amp; stamp</div>
    </div>
  `;
}

function buildReceiptPdf(p) {
  renderReceipt(p);
  return html2pdf().set({
    margin: 0,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
    jsPDF: { unit: 'mm', format: 'a5', orientation: 'landscape' }
  }).from($('receipt')).outputPdf('blob');
}

function setRc(msg, type) { const el = $('rcStatus'); el.textContent = msg || ''; el.className = type || ''; }

async function issueReceipt(p) {
  rc = { p, blob: null, name: '' };
  $('rcTitle').textContent = `Receipt ${p.receiptNo}`;
  $('rcInfo').textContent = `${p.client} · ${money(p.amount)} for invoice ${p.invoiceNo}`;
  $('rcBtns').hidden = true;
  $('rcBtnsBusy').hidden = false;
  $('rcDrive').hidden = true;
  setRc('Creating the receipt PDF…');
  if (!$('rcDialog').open) $('rcDialog').showModal();

  try {
    rc.name = `Receipt ${p.receiptNo} - ${p.client}.pdf`.replace(/[\\/:*?"<>|]/g, '');
    rc.blob = await buildReceiptPdf(p);
    downloadBlob(rc.blob, rc.name);
    $('rcBtns').hidden = false;
    $('rcBtnsBusy').hidden = true;

    setRc('Saving a copy to Google Drive…');
    try {
      const pdfBase64 = await blobToBase64(rc.blob);
      const saved = await api({ action: 'saveReceiptPdf', receiptNo: p.receiptNo, fileName: rc.name, pdfBase64 });
      $('rcDrive').href = saved.url;
      $('rcDrive').hidden = false;
      setRc('Receipt created and saved to Drive.', 'ok');
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
  const missing = payments.filter((p) => !p.link).length;

  $('rCount').textContent = payments.length;
  $('rCountS').textContent = missing ? missing + ' without a saved PDF' : 'all have a saved PDF';
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
      <td><b>${esc(p.receiptNo)}</b><span class="sub">${esc(shortDate(p.date))}</span></td>
      <td>${esc(p.invoiceNo)}</td>
      <td class="client">${esc(p.client)}${p.note ? `<span class="sub">${esc(p.note)}</span>` : ''}</td>
      <td class="num">${money(p.amount)}</td>
      <td class="num">${money(p.balanceAfter)}${p.balanceAfter <= 0.005 ? '<span class="sub">paid in full</span>' : ''}</td>
      <td>${esc(p.method || '—')}</td>
      <td><div class="acts">
        ${p.link
          ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">PDF</a>`
          : `<button type="button" class="pay" data-act="make" data-no="${esc(p.receiptNo)}">Create PDF</button>`}
      </div></td>
    </tr>`).join('');
}
$('rSearch').addEventListener('input', renderReceipts);
$('rcBody').addEventListener('click', (e) => {
  if (e.target.dataset.act !== 'make') return;
  const p = payments.find((x) => x.receiptNo === e.target.dataset.no);
  if (p) issueReceipt(p);
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
$('printBtn').addEventListener('click', () => window.print());
$('newBtn').addEventListener('click', () => {
  $('client').value = '';
  $('date').value = todayISO();
  $('due').value = '';
  $('notes').value = '';
  items = [newItem()];
  lastBlob = null;
  $('result').classList.remove('show');
  setStatus('');
  drawItems();
  refresh();
});
$('client').addEventListener('input', refresh);
$('date').addEventListener('input', refresh);
$('due').addEventListener('input', refresh);
$('notes').addEventListener('input', refresh);

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
  lastBlob = null; rc = { p: null, blob: null, name: '' };
}

function signOut(msg) {
  session = null;
  wipeStored();
  clearData();
  if ($('payDialog').open) $('payDialog').close();
  if ($('rcDialog').open) $('rcDialog').close();
  if ($('pwDialog').open) $('pwDialog').close();
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
