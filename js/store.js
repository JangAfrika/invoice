/* What the browser remembers: the sign-in (token, user, company), a copy of the last lists, the logo.
   Storage can be blocked (private mode), so every access is wrapped and the app still works without it. */
(function () {
  const IM = (window.IM = window.IM || {});
  const KEY = 'im_session';

  function get(store, k) { try { return store.getItem(k); } catch (e) { return null; } }
  function set(store, k, v) { try { store.setItem(k, v); return true; } catch (e) { return false; } }
  function del(store, k) { try { store.removeItem(k); } catch (e) { /* ignore */ } }

  IM.store = {
    read() {
      const raw = get(sessionStorage, KEY) || get(localStorage, KEY);
      try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    },
    kept() { return !!get(localStorage, KEY); },
    save(sess, keep) {
      del(sessionStorage, KEY); del(localStorage, KEY);
      set(keep ? localStorage : sessionStorage, KEY, JSON.stringify(sess));
    },
    update(patch) {
      const cur = IM.store.read();
      if (!cur) return;
      IM.store.save(Object.assign(cur, patch), IM.store.kept());
    },
    clear() {
      del(sessionStorage, KEY); del(localStorage, KEY);
      try {
        Object.keys(sessionStorage).filter((k) => k.indexOf('im_list:') === 0).forEach((k) => sessionStorage.removeItem(k));
      } catch (e) { /* ignore */ }
    },

    /* last lists, so pages show something instantly while fresh data loads */
    readList(companyId) {
      try { return JSON.parse(get(sessionStorage, 'im_list:' + companyId) || 'null'); } catch (e) { return null; }
    },
    saveList(companyId, data) {
      if (!set(sessionStorage, 'im_list:' + companyId, JSON.stringify(data))) del(sessionStorage, 'im_list:' + companyId);
    },
    dropList(companyId) { del(sessionStorage, 'im_list:' + companyId); },

    /* company logo, kept until the company uploads a different one */
    readLogo(companyId, logoId) {
      try {
        const v = JSON.parse(get(localStorage, 'im_logo:' + companyId) || 'null');
        return v && v.id === logoId ? v.data : '';
      } catch (e) { return ''; }
    },
    saveLogo(companyId, logoId, data) { set(localStorage, 'im_logo:' + companyId, JSON.stringify({ id: logoId, data })); }
  };
})();
