/* Shared by the sign-in, sign-up and forgotten-password pages. */
(function () {
  const IM = (window.IM = window.IM || {});
  const cfg = window.APP_CONFIG || {};

  if (IM.theme) IM.theme.floatingButton();
  document.querySelectorAll('[data-app-name]').forEach((el) => { el.textContent = cfg.APP_NAME || 'Invoice Manager'; });
  document.querySelectorAll('[data-app-logo]').forEach((el) => { if (cfg.APP_LOGO) el.src = cfg.APP_LOGO; else el.remove(); });

  // after sign-in / sign-up / reset: remember the session and open the app
  IM.startSession = function (out, keep, next) {
    IM.store.save({ token: out.token, user: out.user, company: out.company }, keep);
    const sys = out.user && out.user.role === 'SystemAdmin';
    const home = sys ? 'sys-dashboard.html' : (out.company && out.company.status === 'Pending' ? 'profile.html' : 'dashboard.html');
    const ok = next && /^[\w-]+\.html(\?[^#]*)?$/.test(next) && (/^sys-/.test(next) === sys);
    location.replace(ok ? next : home);
  };

  // what the sign-in log shows as the device, e.g. "Chrome on Windows"
  IM.deviceInfo = function () {
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { tz = ''; }
    return { device: navigator.userAgent.slice(0, 300), tz };
  };

  IM.busy = function (btn, on, label) {
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.disabled = on;
    btn.textContent = on ? (label || 'Please wait…') : btn.dataset.label;
  };
})();
