/* In-app pop-ups that replace the browser's own confirm() and alert() boxes.
   const yes = await IM.confirm({ title, message, detail, confirmText, cancelText, danger });   -> true / false
   await IM.alert(message, title);
   Esc, a click outside, or Cancel gives false. Focus starts on Cancel so Enter never confirms by accident. */
(function () {
  const IM = (window.IM = window.IM || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let dlg = null;

  function ensure() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'imDialog';
    dlg.className = 'imdlg';
    dlg.setAttribute('aria-labelledby', 'imDlgTitle');
    dlg.setAttribute('aria-describedby', 'imDlgMsg');
    document.body.appendChild(dlg);
    return dlg;
  }

  function open(o) {
    return new Promise((resolve) => {
      const d = ensure();
      const icon = IM.icon ? IM.icon('alert') : '';
      const kind = o.danger ? 'danger' : (o.info ? 'info' : 'ask');
      d.innerHTML = `
        <div class="imdlg-body">
          <div class="imdlg-icon ${kind}" aria-hidden="true">${icon}</div>
          <div class="imdlg-text">
            <h3 id="imDlgTitle">${esc(o.title)}</h3>
            <p id="imDlgMsg">${esc(o.message)}</p>
            ${o.detail ? `<p class="imdlg-detail${o.danger ? ' danger' : ''}">${esc(o.detail)}</p>` : ''}
          </div>
        </div>
        <div class="imdlg-btns">
          ${o.info ? '' : `<button type="button" id="imDlgNo">${esc(o.cancelText || 'Cancel')}</button>`}
          <button type="button" id="imDlgYes" class="${o.danger ? 'danger-solid' : 'primary'}">${esc(o.confirmText || 'OK')}</button>
        </div>`;
      let result = false;
      const done = () => { d.removeEventListener('close', done); d.removeEventListener('click', away); resolve(result); };
      const away = (e) => { if (e.target === d) d.close(); };   // a click on the backdrop
      d.addEventListener('close', done);
      d.addEventListener('click', away);
      d.querySelector('#imDlgYes').addEventListener('click', () => { result = true; d.close(); });
      const no = d.querySelector('#imDlgNo');
      if (no) no.addEventListener('click', () => d.close());
      d.showModal();
      (no || d.querySelector('#imDlgYes')).focus();
    });
  }

  IM.confirm = (o) => open(typeof o === 'string' ? { title: 'Please confirm', message: o, confirmText: 'Yes' } : o);
  IM.alert = (message, title) => open({ title: title || 'Something went wrong', message, info: true, confirmText: 'OK' });
})();
