/* My account: name, email, password and the signature saved on this device. */
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
    showSig();
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

    $('sigForget').addEventListener('click', () => { IM.forgetSignature(); showSig(); });
    $('sigNew').addEventListener('click', async () => { await IM.getSignature('Create your signature'); showSig(); });
  });
})();
