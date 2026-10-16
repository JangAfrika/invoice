/* My account: name, email, password and the signature saved to your account. */
(function () {
  const IM = window.IM;
  const { $ } = IM;

  function fill() {
    const u = IM.user;
    $('pName').value = u.name || '';
    $('pEmail').value = u.email || '';
    $('pInfo').textContent = `You sign in with ${u.email || u.username}${u.email && u.username && u.username !== u.email ? ' or ' + u.username : ''}. Role: ${u.role}.`;
    const c = IM.company;
    $('coLine').textContent = `${c.name}${c.address ? ' · ' + c.address : ''}${IM.isAdmin() ? '' : ' · Only the owner or an admin can change company details.'}`;
  }

  function showSig() {
    const s = IM.savedSignature();
    $('sigHas').hidden = !s;
    $('sigNone').hidden = !!s;
    if (s) $('sigImg').src = s;
  }

  IM.boot({ page: 'account' }).then(() => {
    fill();
    IM.loadSignature().then(showSig);
    const pkRender = async () => {
      if (!IM.passkey.supported()) { $('pkList').innerHTML = '<div class="hint">This browser or device cannot use fingerprint sign-in.</div>'; $('pkAdd').hidden = true; return; }
      try {
        const out = await IM.api({ action: 'passkeyList' });
        if (!out.enabled) { $('pkPanel').hidden = true; return; }
        $('pkList').innerHTML = out.passkeys.length ? out.passkeys.map((p) => `
          <div class="pkrow"><div><b>${IM.esc(p.name)}</b><span class="sub">Added ${IM.esc(IM.shortDate((p.createdAt || '').slice(0, 10)))}${p.lastUsedAt ? ' · last used ' + IM.esc(IM.shortDate(p.lastUsedAt.slice(0, 10))) : ' · not used yet'}</span></div>
          <button type="button" class="danger small" data-pk="${IM.esc(p.id)}">Remove</button></div>`).join('') : '<div class="hint">No device is set up yet.</div>';
      } catch (err) { $('pkError').textContent = err.message; }
    };
    pkRender();
    $('pkAdd').addEventListener('click', async () => {
      $('pkError').textContent = '';
      $('pkAdd').disabled = true;
      try { await IM.passkey.register(); await pkRender(); IM.alert('Next time, tap "Sign in with fingerprint or face" on the sign-in page.', 'Fingerprint sign-in is on'); }
      catch (err) { $('pkError').textContent = err.message; } finally { $('pkAdd').disabled = false; }
    });
    $('pkList').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pk]');
      if (!b) return;
      if (!await IM.confirm({ title: 'Remove this device?', message: 'It will no longer sign in with a fingerprint.', confirmText: 'Remove', danger: true })) return;
      try { await IM.api({ action: 'passkeyRemove', id: b.dataset.pk }); await pkRender(); } catch (err) { $('pkError').textContent = err.message; }
    });
    $('abGender').value = IM.user.gender || '';
    $('abAge').value = IM.user.age || '';
    $('aboutForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      $('abError').textContent = '';
      $('abSave').disabled = true;
      try {
        const out = await IM.api({ action: 'saveDemographics', gender: $('abGender').value, age: $('abAge').value });
        IM.user = out.user; IM.store.update({ user: out.user });
        IM.alert('Your details are saved.', 'Saved');
      } catch (err) { $('abError').textContent = err.message; } finally { $('abSave').disabled = false; }
    });
    IM.refreshCompany().then(fill).catch(() => {});

    $('profileForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('pName').value.trim();
      const email = $('pEmail').value.trim();
      const err = (m, ok) => { $('profileError').textContent = m; $('profileError').className = 'err' + (ok ? ' ok' : ''); };
      if (name.length < 2) return err('Enter your full name.');
      $('profileSave').disabled = true;
      try {
        const out = await IM.api({ action: 'updateProfile', name, email });
        IM.setUser(out.user);
        fill();
        err('Saved.', true);
      } catch (e2) {
        err(e2.message);
      } finally {
        $('profileSave').disabled = false;
      }
    });

    $('pwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const oldPw = $('pwOld').value, newPw = $('pwNew').value, again = $('pwNew2').value;
      const err = (m, ok) => { $('pwError').textContent = m; $('pwError').className = 'err' + (ok ? ' ok' : ''); };
      if (!oldPw) return err('Enter your current password.');
      if (newPw.length < 8) return err('The new password must be at least 8 characters.');
      if (newPw !== again) return err('The new passwords do not match.');
      $('pwSave').disabled = true;
      try {
        const out = await IM.api({ action: 'changePassword', oldPassword: oldPw, newPassword: newPw });
        IM.session.token = out.token;          // the old token stops working once the password changes
        IM.store.update({ token: out.token });
        ['pwOld', 'pwNew', 'pwNew2'].forEach((id) => { $(id).value = ''; });
        err('Password changed.', true);
      } catch (e2) {
        err(e2.message);
      } finally {
        $('pwSave').disabled = false;
      }
    });

    $('sigForget').addEventListener('click', async () => { try { await IM.forgetSignature(); } catch (e) { IM.alert(e.message); } showSig(); });
    $('sigNew').addEventListener('click', async () => { await IM.getSignature('My signature', { save: true }); showSig(); });
  });
})();
