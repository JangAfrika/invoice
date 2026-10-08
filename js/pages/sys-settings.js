/* System Admin > Settings: notifications, approval of new companies, software policy, other system admins, my account. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  const FLAGS = ['requireApproval', 'notifyNewCompany', 'notifyNewStaff', 'notifyNewClient', 'notifyNewTicket'];

  function fill(out) {
    const s = out.settings;
    $('sNotify').value = s.notifyEmail || '';
    $('sNotify').placeholder = out.ownerEmail || 'your email';
    $('sNotifyHint').textContent = `Empty = ${out.ownerEmail || 'the Google account that owns the script'}.` +
      (out.emailQuota != null ? ` Emails left today: ${out.emailQuota}.` : '');
    $('sSupport').value = s.supportEmail || '';
    $('sAppUrl').value = s.appUrl || '';
    $('sPolicy').value = s.policy || '';
    FLAGS.forEach((f) => { $('s_' + f).checked = s[f] !== false; });
    $('adminBody').innerHTML = out.admins.map((a) => `<tr><td><b>${esc(a.name)}</b><span class="sub">${esc(a.email)}</span></td>
      <td>${a.active ? IM.pill('Active') : IM.pill('Off', 'no')}</td><td>${esc(IM.ago(a.lastLogin))}</td></tr>`).join('');
  }

  async function load() {
    try { fill(await IM.api({ action: 'sysGetSettings' })); } catch (err) { IM.setMsg('setStatus', err.message, 'error'); }
  }

  IM.sysBoot({ page: 'settings', title: 'Settings' }).then(() => {
    $('meName').value = IM.user.name || '';
    $('meEmail').value = IM.user.email || '';

    $('setForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const settings = { notifyEmail: $('sNotify').value.trim(), supportEmail: $('sSupport').value.trim(), appUrl: $('sAppUrl').value.trim(), policy: $('sPolicy').value.trim() };
      FLAGS.forEach((f) => { settings[f] = $('s_' + f).checked; });
      $('setSave').disabled = true;
      try {
        await IM.api({ action: 'sysSaveSettings', settings });
        IM.setMsg('setStatus', 'Settings saved.', 'ok');
        load();
      } catch (err) { IM.setMsg('setStatus', err.message, 'error'); }
      $('setSave').disabled = false;
    });
    $('testBtn').addEventListener('click', async () => {
      try { const out = await IM.api({ action: 'sysTestEmail' }); IM.setMsg('setStatus', 'Test email sent to ' + out.to + '.', 'ok'); } catch (err) { IM.setMsg('setStatus', err.message, 'error'); }
    });

    $('adminForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await IM.api({ action: 'sysAddAdmin', name: $('aName').value.trim(), email: $('aEmail').value.trim(), password: $('aPass').value });
        $('adminForm').reset();
        IM.setMsg('adminStatus', 'System admin added. Give them the password; they can change it here under My account.', 'ok');
        load();
      } catch (err) { IM.setMsg('adminStatus', err.message, 'error'); }
    });

    $('meForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const out = await IM.api({ action: 'updateProfile', name: $('meName').value.trim(), email: $('meEmail').value.trim() });
        IM.setUser(out.user);
        IM.setMsg('meStatus', 'Saved.', 'ok');
      } catch (err) { IM.setMsg('meStatus', err.message, 'error'); }
    });
    $('mePwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if ($('mePwNew').value !== $('mePwNew2').value) { IM.setMsg('mePwStatus', 'The new passwords do not match.', 'error'); return; }
      try {
        const out = await IM.api({ action: 'changePassword', oldPassword: $('mePwOld').value, newPassword: $('mePwNew').value });
        IM.session.token = out.token;
        IM.store.update({ token: out.token });
        $('mePwForm').reset();
        IM.setMsg('mePwStatus', 'Password changed.', 'ok');
      } catch (err) { IM.setMsg('mePwStatus', err.message, 'error'); }
    });
    load();
  });
})();
