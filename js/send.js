/* "Send by email": emails a saved (signed) invoice or receipt PDF to the client.
   IM.Send.open({ kind: 'invoice' | 'receipt', id, no, client, email, customerHasEmail, sentTo, onDone }) */
(function () {
  const IM = (window.IM = window.IM || {});
  const $ = (id) => document.getElementById(id);
  let ready = false;
  let ctx = null;

  const HTML = `
  <dialog id="sendDialog">
    <form class="dlg" id="sendForm" novalidate>
      <h3 id="sendTitle">Send by email</h3>
      <div class="info" id="sendInfo"></div>
      <label>To (separate several addresses with commas)
        <input id="sendTo" type="text" inputmode="email" autocomplete="off" placeholder="client@example.com">
      </label>
      <label>Message
        <textarea id="sendMsg" rows="4" maxlength="2000"></textarea>
      </label>
      <label class="check"><input type="checkbox" id="sendCopy"> Send me a copy</label>
      <label class="check" id="sendSaveWrap" hidden><input type="checkbox" id="sendSave" checked> Save this email on the customer</label>
      <div class="hint" style="margin-top:2px">The signed PDF is attached. Replies go to your company email.</div>
      <div class="err" id="sendError" role="alert"></div>
      <div class="btns">
        <button type="button" id="sendCancel">Cancel</button>
        <button type="submit" class="primary" id="sendGo">Send</button>
      </div>
    </form>
  </dialog>`;

  function init() {
    if (ready) return;
    ready = true;
    document.body.insertAdjacentHTML('beforeend', HTML);
    $('sendCancel').addEventListener('click', () => $('sendDialog').close());
    $('sendTo').addEventListener('input', () => {
      $('sendSaveWrap').hidden = !ctx || ctx.customerHasEmail || $('sendTo').value.split(/[,;\s]+/).filter(Boolean).length !== 1;
    });
    $('sendForm').addEventListener('submit', send);
  }

  function defaultMessage(o) {
    const c = IM.company || {};
    if (o.kind === 'receipt') return `Thank you for your payment. Please find receipt ${o.no} attached.\n\nKind regards,\n${IM.user ? IM.user.name : ''}\n${c.name || ''}`;
    return `Please find invoice ${o.no} attached.${o.balance ? ' The balance due is ' + IM.money(o.balance) + (o.due ? ', due by ' + IM.prettyDate(o.due) : '') + '.' : ''}\n\nKind regards,\n${IM.user ? IM.user.name : ''}\n${c.name || ''}`;
  }

  async function send(e) {
    e.preventDefault();
    const to = $('sendTo').value.trim();
    const list = to.split(/[,;\s]+/).filter(Boolean);
    if (!list.length) { $('sendError').textContent = 'Enter the client\'s email address.'; return; }
    const bad = list.find((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(x));
    if (bad) { $('sendError').textContent = `"${bad}" is not a valid email address.`; return; }
    const btn = $('sendGo');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    $('sendError').textContent = '';
    try {
      const out = await IM.api({
        action: 'sendDocument', kind: ctx.kind, id: ctx.id, to: list.join(', '), message: $('sendMsg').value.trim(),
        copyMe: $('sendCopy').checked, saveEmail: !$('sendSaveWrap').hidden && $('sendSave').checked
      });
      IM.dropList();
      $('sendDialog').close();
      if (ctx.onDone) ctx.onDone(out);
    } catch (err) {
      $('sendError').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send';
    }
  }

  IM.Send = {
    open(o) {
      init();
      ctx = o;
      $('sendTitle').textContent = `Send ${o.kind === 'receipt' ? 'receipt' : 'invoice'} ${o.no}`;
      $('sendInfo').textContent = o.client + (o.sentTo ? ` · last sent to ${o.sentTo}` : '');
      $('sendTo').value = o.email || '';
      $('sendMsg').value = defaultMessage(o);
      $('sendCopy').checked = false;
      $('sendSaveWrap').hidden = !!o.customerHasEmail || !o.email;
      $('sendError').textContent = '';
      $('sendDialog').showModal();
      if (!o.email) $('sendTo').focus();
    },
    // finds the customer's email in a list loaded with IM.loadList
    emailOf(customers, customerId) {
      const c = (customers || []).find((x) => x.id === customerId);
      return c && c.email ? c.email : '';
    }
  };
})();
