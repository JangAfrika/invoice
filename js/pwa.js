/* Install as an app (phone / desktop) and work with a weak connection (service worker). */
(function () {
  const IM = (window.IM = window.IM || {});
  let installEvent = null;
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  function buttons() { return [document.getElementById('installBtn'), document.getElementById('installLink')].filter(Boolean); }
  function show(on) { buttons().forEach((b) => { b.hidden = !on; }); }

  function iosHelp() {
    let d = document.getElementById('iosDialog');
    if (!d) {
      document.body.insertAdjacentHTML('beforeend', `
        <dialog id="iosDialog"><div class="dlg">
          <h3>Install on iPhone or iPad</h3>
          <div class="info">Apple does not allow a one-tap install, so do this in Safari:</div>
          <ol style="margin:0 0 14px;padding-left:20px;line-height:1.7;font-size:14px">
            <li>Tap the <b>Share</b> button (the square with an arrow).</li>
            <li>Choose <b>Add to Home Screen</b>.</li>
            <li>Tap <b>Add</b>. The app now opens from your home screen.</li>
          </ol>
          <div class="btns"><button type="button" class="primary" id="iosClose">Got it</button></div>
        </div></dialog>`);
      d = document.getElementById('iosDialog');
      document.getElementById('iosClose').addEventListener('click', () => d.close());
    }
    d.showModal();
  }

  async function install() {
    if (installEvent) {
      const ev = installEvent;
      installEvent = null;
      ev.prompt();
      try { await ev.userChoice; } catch (e) { /* ignore */ }
      show(false);
    } else if (isIOS()) {
      iosHelp();
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    if (!isStandalone()) show(true);
  });
  window.addEventListener('appinstalled', () => { installEvent = null; show(false); });

  // call after the buttons are on the page
  IM.initInstall = function () {
    buttons().forEach((b) => { if (!b.dataset.wired) { b.dataset.wired = '1'; b.addEventListener('click', install); } });
    if (!isStandalone() && (installEvent || isIOS())) show(true);
  };
  document.addEventListener('DOMContentLoaded', () => IM.initInstall());
})();
