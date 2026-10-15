/* Sign-up page: creates the company and its owner, then offers the logo upload. */
(function () {
  const IM = window.IM;
  const { $ } = IM;
  let picked = null;

  // ask the server whether a sign-up code is needed (also wakes the server up)
  // also shows the software policy and whether new companies need approval
  IM.post({ action: 'ping' }).then((out) => {
    if (!out) return;
    if (out.signupCode) $('suCodeWrap').hidden = false;
    if (out.policy) $('suPolicyText').textContent = out.policy;
    if (out.requireApproval) $('suApproval').hidden = false;
  }).catch(() => {});

  function suggestPrefix(name) {
    const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    let p = words.length > 1 ? words.slice(0, 3).map((w) => w[0]).join('') : (words[0] || 'INV').slice(0, 3);
    if (p.length < 2) p = (p + 'INV').slice(0, 3);
    return p;
  }
  function updatePrefixDemo() {
    const p = ($('suPrefix').value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')) || suggestPrefix($('suCompany').value);
    $('suPrefix').placeholder = suggestPrefix($('suCompany').value);
    $('suPrefixDemo').textContent = p + '1001';
  }
  $('suCompany').addEventListener('input', updatePrefixDemo);
  $('suPrefix').addEventListener('input', updatePrefixDemo);
  updatePrefixDemo();
  $('suCompany').focus();

  $('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = (m) => { $('suError').textContent = m; };
    const req = {
      action: 'signup',
      companyName: $('suCompany').value.trim(),
      phone: $('suPhone').value.trim(),
      companyEmail: $('suCoEmail').value.trim(),
      address: $('suAddress').value.trim(),
      currency: $('suCurrency').value.trim(),
      currencyName: $('suCurName').value.trim(),
      invoicePrefix: $('suPrefix').value.trim(),
      name: $('suName').value.trim(),
      email: $('suEmail').value.trim(),
      password: $('suPass').value,
      signupCode: $('suCode').value.trim(),
      hp: $('suHp').value
    };
    if (req.companyName.length < 2) return err('Enter your company name.');
    if (req.name.length < 2) return err('Enter your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(req.email)) return err('Enter a valid email address.');
    if (req.password.length < 8) return err('The password must be at least 8 characters.');
    if (req.password !== $('suPass2').value) return err('The passwords do not match.');
    if (!$('suAgree').checked) return err('Please accept the software policy.');
    Object.assign(req, IM.deviceInfo(), { industry: $('suIndustry').value.trim(), country: $('suCountry').value.trim() });
    if (req.currency && req.currency !== 'D' && req.currencyName === 'dalasi') req.currencyName = '';

    const btn = $('suBtn');
    IM.busy(btn, true, 'Creating your account…');
    err('');
    try {
      const out = await IM.post(req);
      if (!out.ok) throw new Error(out.error || 'Sign-up failed');
      IM.store.save({ token: out.token, user: out.user, company: out.company }, false);
      IM.session = IM.store.read();
      IM.user = out.user;
      IM.company = out.company;
      IM.track('sign_up');
      $('signupForm').hidden = true;
      $('logoStep').hidden = false;
      if (out.company && out.company.status === 'Pending') {
        $('logoPending').hidden = false;
        $('skipLogo').href = 'profile.html';
      }
      window.scrollTo(0, 0);
    } catch (e2) {
      err(e2.message);
      IM.busy(btn, false);
    }
  });

  $('logoFile').addEventListener('change', async (e) => {
    $('logoError').textContent = '';
    picked = null;
    $('logoBtn').disabled = true;
    try {
      picked = await IM.resizeImage(e.target.files[0], 600, 300);
      $('logoPrev').innerHTML = `<img src="${picked.dataUrl}" alt="" style="max-width:220px;max-height:115px;object-fit:contain">`;
      $('logoBtn').disabled = false;
    } catch (e2) {
      $('logoError').textContent = e2.message;
    }
  });

  $('logoBtn').addEventListener('click', async () => {
    if (!picked) return;
    const btn = $('logoBtn');
    IM.busy(btn, true, 'Uploading…');
    try {
      const out = await IM.api({ action: 'uploadLogo', base64: picked.base64, mimeType: picked.mimeType });
      IM.store.update({ company: out.company });
      IM.store.saveLogo(out.company.id, out.company.logoId, out.logo);
      location.replace(out.company.status === 'Pending' ? 'profile.html' : 'dashboard.html');
    } catch (e2) {
      $('logoError').textContent = e2.message;
      IM.busy(btn, false);
    }
  });
})();
