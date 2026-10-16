/* Fingerprint / face / screen-lock sign-in (passkeys). The device keeps the private key and unlocks it
   with the person's fingerprint, face or PIN; the server only gets a signature. Works on pages that load api.js. */
(function () {
  const IM = (window.IM = window.IM || {});

  const b64u = (buf) => btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = (s) => {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  };
  const friendly = (err) => {
    const n = err && err.name;
    if (n === 'NotAllowedError') return 'The fingerprint check was cancelled or timed out.';
    if (n === 'InvalidStateError') return 'This device is already registered.';
    if (n === 'NotSupportedError') return 'This device cannot use fingerprint sign-in.';
    if (n === 'SecurityError') return 'Fingerprint sign-in does not work on this web address.';
    return (err && err.message) || 'Fingerprint sign-in failed.';
  };

  IM.passkey = {
    supported: () => !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create && window.isSecureContext !== false),

    // name for the list of devices, e.g. "Chrome on Android"
    deviceName() {
      const ua = navigator.userAgent;
      const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
      const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'device';
      return br + ' on ' + os;
    },

    // signed-in person: add this device
    async register(deviceName) {
      const o = await IM.api({ action: 'passkeyRegOptions', origin: location.origin });
      let cred;
      try {
        cred = await navigator.credentials.create({
          publicKey: {
            challenge: unb64u(o.challenge),
            rp: o.rp,
            user: { id: unb64u(o.user.id), name: o.user.name, displayName: o.user.displayName },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
            authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
            excludeCredentials: (o.exclude || []).map((id) => ({ type: 'public-key', id: unb64u(id) })),
            attestation: 'none',
            timeout: 60000
          }
        });
      } catch (e) { throw new Error(friendly(e)); }
      if (!cred.response.getPublicKey) throw new Error('This browser cannot create a fingerprint sign-in. Update it and try again.');
      return IM.api({
        action: 'passkeyRegister', credentialId: cred.id, clientDataJSON: b64u(cred.response.clientDataJSON),
        publicKey: b64u(cred.response.getPublicKey()), deviceName: deviceName || IM.passkey.deviceName()
      });
    },

    // sign-in page: ask the device for a fingerprint and send the proof (no password, no typing)
    async login(extra) {
      const o = await IM.post({ action: 'passkeyLoginOptions', origin: location.origin });
      if (!o.ok) throw new Error(o.error || 'Fingerprint sign-in is not available.');
      let cred;
      try {
        cred = await navigator.credentials.get({ publicKey: { challenge: unb64u(o.challenge), rpId: o.rpId, userVerification: 'required', timeout: 60000 } });
      } catch (e) { throw new Error(friendly(e)); }
      const out = await IM.post(Object.assign({
        action: 'passkeyLogin', credentialId: cred.id,
        authenticatorData: b64u(cred.response.authenticatorData), clientDataJSON: b64u(cred.response.clientDataJSON), signature: b64u(cred.response.signature)
      }, extra || {}));
      if (!out.ok) throw new Error(out.error || 'Fingerprint sign-in failed.');
      return out;
    }
  };
})();
