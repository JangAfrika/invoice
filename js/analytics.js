/* Google Analytics: the Google tag itself sits in the <head> of every page (page views are sent by it).
   IM.track(name, details) sends the app's own events (invoice_created, receipt_emailed, ...) through the same tag.
   Nothing personal is sent: no names, emails or company names. */
(function () {
  const IM = (window.IM = window.IM || {});
  const area = /(^|\/)sys-/.test(location.pathname) ? 'admin' : 'company';
  IM.track = function (name, details) {
    if (typeof window.gtag !== 'function') return;
    try { window.gtag('event', name, Object.assign({ app_area: area }, details || {})); } catch (e) { /* analytics never breaks the app */ }
  };
})();
