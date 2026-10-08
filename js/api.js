/* Talking to the Apps Script backend. */
(function () {
  const IM = (window.IM = window.IM || {});
  const TIMEOUT_MS = 90000;

  // text/plain avoids the CORS preflight that Apps Script does not support
  IM.post = async function (payload) {
    const url = window.APP_CONFIG.SCRIPT_URL;
    if (!url || url.indexOf('/exec') < 0) throw new Error('Add your Apps Script Web App URL in js/config.js first.');
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('The server took too long to answer. Please try again.');
      throw new Error(navigator.onLine ? 'Could not reach the server. Check your connection and try again.' : 'You are offline. Connect to the internet to continue.');
    } finally {
      if (timer) clearTimeout(timer);
    }
    try { return await res.json(); } catch (e) {
      throw new Error('Unexpected reply from the server. Check that the Web App is deployed with access set to "Anyone".');
    }
  };

  // signed-in calls
  IM.api = async function (payload) {
    if (!IM.session) throw new Error('Please sign in.');
    const out = await IM.post(Object.assign({ token: IM.session.token }, payload));
    if (out.authRequired) {
      const why = out.error || 'Your session has ended. Please sign in again.';
      IM.signOut(why);
      throw new Error(why);
    }
    if (!out.ok) throw new Error(out.error || 'Request failed');
    if (out.meta) noticeMeta(out.meta);
    return out;
  };

  // the company profile or my role changed somewhere else: fetch the fresh copy in the background
  let refreshing = null;
  function noticeMeta(meta) {
    const c = IM.company || {};
    const stale = (meta.companyUpdated && meta.companyUpdated !== c.updatedAt) || (meta.role && IM.user && meta.role !== IM.user.role) ||
      (meta.status && c.status && meta.status !== c.status);
    if (stale && !refreshing) refreshing = IM.refreshCompany().catch(() => {}).finally(() => { refreshing = null; });
  }

  IM.refreshCompany = async function () {
    const out = await IM.api({ action: 'me' });
    IM.setUser(out.user);
    if (out.company) IM.setCompany(out.company);
    return out;
  };

  IM.setUser = function (user) {
    IM.user = user;
    if (IM.session) IM.session.user = user;
    IM.store.update({ user });
    document.dispatchEvent(new CustomEvent('im:user', { detail: user }));
  };

  IM.setCompany = function (company) {
    IM.company = company;
    if (IM.session) IM.session.company = company;
    IM.store.update({ company });
    if (IM.applyBrand) IM.applyBrand();
    document.dispatchEvent(new CustomEvent('im:company', { detail: company }));
  };

  IM.isAdmin = () => !!IM.user && (IM.user.role === 'Owner' || IM.user.role === 'Admin');
  IM.isSys = () => !!IM.user && IM.user.role === 'SystemAdmin';

  IM.signOut = function (msg) {
    IM.store.clear();
    IM.session = null;
    const q = msg ? '?msg=' + encodeURIComponent(msg) : '';
    location.replace('login.html' + q);
  };

  /* invoices + payments + customers in one call.
     onData runs at once with the copy from the last visit (if any), then again with fresh data. */
  IM.loadList = async function (onData) {
    const cid = IM.company && IM.company.id;
    const cached = cid ? IM.store.readList(cid) : null;
    if (cached) IM.customers = cached.customers;
    if (cached && onData) onData(cached, true);
    const out = await IM.api({ action: 'list' });
    const data = { invoices: out.invoices || [], payments: out.payments || [], customers: out.customers || [], version: out.version };
    if (cid) IM.store.saveList(cid, data);
    IM.customers = data.customers;
    if (onData && !(cached && cached.version === data.version)) onData(data, false);
    return data;
  };
  IM.dropList = () => { if (IM.company) IM.store.dropList(IM.company.id); };

  /* opens a saved invoice/receipt PDF. The window is opened first (inside the click) so pop-up blockers allow it. */
  IM.openPdf = async function (kind, id, onError) {
    let w = null;
    try { w = window.open('', '_blank'); if (w) w.document.write('<p style="font-family:sans-serif">Opening the PDF…</p>'); } catch (e) { w = null; }
    try {
      const out = await IM.api({ action: 'getPdf', kind, id });
      const blob = IM.base64ToBlob(out.base64, 'application/pdf');
      if (w && !w.closed) w.location.href = URL.createObjectURL(blob);
      else IM.downloadBlob(blob, out.fileName);
    } catch (err) {
      if (w && !w.closed) w.close();
      if (onError) onError(err); else IM.alert(err.message);
    }
  };
})();
