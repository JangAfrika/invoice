/* Light / dark scheme, remembered on this device (one choice for every page of the app).
   Loaded first on every page so the page never flashes the wrong colours. */
(function () {
  const IM = (window.IM = window.IM || {});
  const KEY = 'im_theme';
  const isSys = () => document.body && document.body.classList.contains('sys');

  IM.theme = {
    get() {
      let t = null;
      try { t = localStorage.getItem(KEY); } catch (e) { t = null; }
      if (t === 'light' || t === 'dark') return t;
      return 'light';
    },
    apply(t) {
      document.documentElement.classList.toggle('dark-root', t === 'dark');
      if (document.body) {
        document.body.classList.toggle('dark', t === 'dark');
        document.body.classList.toggle('light', t !== 'dark');
      }
      const btn = document.getElementById('themeBtn');
      if (btn && IM.icon) btn.innerHTML = IM.icon(t === 'dark' ? 'sun' : 'moon');
      if (btn) btn.title = t === 'dark' ? 'Switch to the light scheme' : 'Switch to the dark scheme';
      if (window.Chart) {
        const dark = t === 'dark';
        Chart.defaults.color = dark ? '#8f97a6' : '#667085';
        Chart.defaults.borderColor = dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)';
      }
      document.dispatchEvent(new CustomEvent('im:theme', { detail: t }));
      if (IM.onTheme) IM.onTheme(t);
    },
    set(t) {
      try { localStorage.setItem(KEY, t); } catch (e) { /* works without storage */ }
      IM.theme.apply(t);
    },
    toggle() { IM.theme.set(IM.theme.get() === 'dark' ? 'light' : 'dark'); },
    // a floating button for pages without a top bar (sign-in pages)
    floatingButton() {
      if (document.getElementById('themeBtn')) return;
      const b = document.createElement('button');
      b.type = 'button'; b.id = 'themeBtn'; b.className = 'themebtn';
      b.addEventListener('click', IM.theme.toggle);
      document.body.appendChild(b);
      IM.theme.apply(IM.theme.get());
    }
  };
})();
