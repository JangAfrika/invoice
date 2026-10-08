/* Sign-in page */
(function () {
  const { $ } = window.IM;
  const IM = window.IM;

  const existing = IM.store.read();
  if (existing && existing.token && (existing.company || (existing.user && existing.user.role === 'SystemAdmin'))) {
    IM.startSession(existing, IM.store.kept(), IM.param('next'));
    return;
  }

  const msg = IM.param('msg');
  if (msg) $('loginError').textContent = msg;
  $('loginUser').focus();

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const login = $('loginUser').value.trim();
    const password = $('loginPass').value;
    if (!login || !password) { $('loginError').textContent = 'Enter your email (or username) and password.'; return; }
    const btn = $('loginBtn');
    IM.busy(btn, true, 'Signing in…');
    $('loginError').textContent = '';
    try {
      const keep = $('loginKeep').checked;
      const out = await IM.post(Object.assign({ action: 'login', login, password, remember: keep }, IM.deviceInfo()));
      if (!out.ok) throw new Error(out.error || 'Sign in failed');
      IM.track('login');
      IM.startSession(out, keep, IM.param('next'));
    } catch (err) {
      $('loginError').textContent = err.message;
      $('loginPass').value = '';
      $('loginPass').focus();
      IM.busy(btn, false);
    }
  });
})();
