/* Forgotten password: email a code, then set a new password with it. */
(function () {
  const IM = window.IM;
  const { $ } = IM;

  function showReset(email, note) {
    $('askForm').hidden = true;
    $('resetForm').hidden = false;
    $('rsEmail').value = email || $('fgEmail').value.trim();
    if (note) $('resetSub').textContent = note;
    ($('rsEmail').value ? $('rsCode') : $('rsEmail')).focus();
  }

  $('askForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('fgEmail').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { $('askError').textContent = 'Enter a valid email address.'; return; }
    IM.busy($('askBtn'), true, 'Sending…');
    $('askError').textContent = '';
    try {
      const out = await IM.post({ action: 'requestReset', email });
      if (!out.ok) throw new Error(out.error || 'Could not send the code');
      showReset(email, out.message + ' Check your spam folder too.');
    } catch (err) {
      $('askError').textContent = err.message;
    } finally {
      IM.busy($('askBtn'), false);
    }
  });

  $('haveCode').addEventListener('click', (e) => { e.preventDefault(); showReset(); });
  $('backAsk').addEventListener('click', (e) => { e.preventDefault(); $('resetForm').hidden = true; $('askForm').hidden = false; });

  $('resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = (m) => { $('rsError').textContent = m; };
    const email = $('rsEmail').value.trim();
    const code = $('rsCode').value.trim();
    const pw = $('rsPass').value;
    if (!email || !/^\d{6}$/.test(code)) return err('Enter your email and the 6-digit code.');
    if (pw.length < 8) return err('The new password must be at least 8 characters.');
    if (pw !== $('rsPass2').value) return err('The passwords do not match.');
    IM.busy($('rsBtn'), true, 'Saving…');
    err('');
    try {
      const out = await IM.post({ action: 'resetPassword', email, code, newPassword: pw });
      if (!out.ok) throw new Error(out.error || 'Could not reset the password');
      IM.startSession(out, false);
    } catch (e2) {
      err(e2.message);
      IM.busy($('rsBtn'), false);
    }
  });
})();
