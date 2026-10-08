/* Service worker: lets the app install and open even with a poor or no connection.
   Invoice data is never cached here: every call to Google Apps Script goes straight to the network.
   App files use "network first", so a new version appears on the next reload.
   Change CACHE (v2 -> v3 ...) when you publish new files. */
const CACHE = 'invoice-manager-v8';
const SHELL = [
  './',
  'account.html',
  'activity.html',
  'company.html',
  'css/admin.css',
  'css/app.css',
  'css/auth.css',
  'css/base.css',
  'css/documents.css',
  'css/theme.css',
  'customers.html',
  'dashboard.html',
  'forgot.html',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'index.html',
  'invoice-new.html',
  'invoices.html',
  'js/api.js',
  'js/branding.js',
  'js/config.js',
  'js/analytics.js',
  'js/dialogs.js',
  'js/documents.js',
  'js/icons.js',
  'js/image.js',
  'js/layout.js',
  'js/pages/account.js',
  'js/pages/activity.js',
  'js/pages/auth-common.js',
  'js/pages/company.js',
  'js/pages/customers.js',
  'js/pages/dashboard.js',
  'js/pages/forgot.js',
  'js/pages/invoice-new.js',
  'js/pages/invoices.js',
  'js/pages/login.js',
  'js/pages/profile.js',
  'js/pages/receipts.js',
  'js/pages/signup.js',
  'js/pages/support.js',
  'js/pages/sys-activity.js',
  'js/pages/sys-companies.js',
  'js/pages/sys-dashboard.js',
  'js/pages/sys-logins.js',
  'js/pages/sys-settings.js',
  'js/pages/sys-tickets.js',
  'js/pages/sys-users.js',
  'js/pages/team.js',
  'js/payments.js',
  'js/pwa.js',
  'js/send.js',
  'js/signature.js',
  'js/store.js',
  'js/sys-layout.js',
  'js/theme.js',
  'js/utils.js',
  'login.html',
  'logo.png',
  'manifest.webmanifest',
  'profile.html',
  'receipts.html',
  'signup.html',
  'support.html',
  'sys-activity.html',
  'sys-companies.html',
  'sys-dashboard.html',
  'sys-logins.html',
  'sys-settings.html',
  'sys-tickets.html',
  'sys-users.html',
  'team.html'
];
const LIBS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // one by one, so a missing optional file cannot break the install
    await Promise.all(SHELL.map((u) => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('invoice-manager-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then((r) => { clearTimeout(t); resolve(r); }, (err) => { clearTimeout(t); reject(err); });
  });
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  try {
    const res = cached ? await fetchWithTimeout(req, 5000) : await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const shell = (await cache.match('index.html')) || (await cache.match('./'));
      if (shell) return shell;
    }
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const update = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await update) || Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // saving invoices/payments (POST) is never touched
  const url = new URL(req.url);
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com')) return;
  if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
  else if (LIBS.includes(url.hostname)) e.respondWith(staleWhileRevalidate(req));
});
