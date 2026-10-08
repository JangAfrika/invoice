/* System Admin > Users: everyone who can sign in, who is online, locked or switched off. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  let users = [];
  let filter = 'all';

  function statusOf(u) {
    const bits = [];
    if (u.online) bits.push('<span class="dotlive"></span>Online');
    bits.push(u.active ? IM.pill('Active') : IM.pill('Off', 'no'));
    if (u.locked) bits.push(IM.pill('Locked'));
    return bits.join(' ');
  }

  function render() {
    const q = $('search').value.trim().toLowerCase();
    const list = users.filter((u) => {
      if (filter === 'online' && !u.online) return false;
      if (filter === 'off' && u.active) return false;
      if (filter === 'locked' && !u.locked) return false;
      if (filter === 'sys' && u.role !== 'SystemAdmin') return false;
      return !q || [u.name, u.email, u.username, u.company, u.role].join(' ').toLowerCase().includes(q);
    }).sort((a, b) => (b.lastLogin || '').localeCompare(a.lastLogin || ''));
    $('uAll').textContent = users.length;
    $('uOnline').textContent = users.filter((u) => u.online).length;
    $('uOff').textContent = users.filter((u) => !u.active).length;
    $('uLocked').textContent = users.filter((u) => u.locked).length;
    $('uBody').innerHTML = list.length ? list.map((u) => `
      <tr>
        <td><b>${esc(u.name)}</b><span class="sub">${esc(u.email || u.username)}</span></td>
        <td>${u.companyId ? `<a href="sys-companies.html?id=${encodeURIComponent(u.companyId)}">${esc(u.company)}</a>` : esc(u.company)}</td>
        <td>${IM.pill(u.role, 'role')}</td>
        <td>${statusOf(u)}</td>
        <td>${esc(IM.ago(u.lastLogin))}${u.lastSeen ? `<span class="sub">seen ${esc(IM.ago(u.lastSeen))}</span>` : ''}</td>
        <td>${esc(u.createdAt ? IM.shortDate(u.createdAt.slice(0, 10)) : '')}</td>
        <td><div class="acts">
          ${u.id === IM.user.id ? '<span class="hint">you</span>' : `
          <button type="button" class="small ${u.active ? 'bad' : 'good'}" data-act="toggle" data-id="${esc(u.id)}">${u.active ? 'Switch off' : 'Switch on'}</button>
          <button type="button" class="small" data-act="pw" data-id="${esc(u.id)}">Set password</button>`}
          ${u.locked ? `<button type="button" class="small" data-act="unlock" data-id="${esc(u.id)}">Unlock</button>` : ''}
        </div></td>
      </tr>`).join('') : '<tr><td colspan="7" class="empty">No users here.</td></tr>';
  }

  async function load() {
    IM.setMsg('uStatus', users.length ? '' : 'Loading…');
    try {
      users = (await IM.api({ action: 'sysUsers' })).users;
      render();
      IM.setMsg('uStatus', '');
    } catch (err) { IM.setMsg('uStatus', err.message, 'error'); }
  }

  IM.sysBoot({ page: 'users', title: 'Users' }).then(() => {
    $('chips').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]');
      if (!b) return;
      filter = b.dataset.f;
      document.querySelectorAll('#chips button').forEach((x) => x.classList.toggle('active', x === b));
      render();
    });
    $('search').addEventListener('input', render);
    $('reloadBtn').addEventListener('click', load);
    $('uBody').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const u = users.find((x) => x.id === b.dataset.id);
      if (!u) return;
      if (b.dataset.act === 'pw') {
        $('pwInfo').textContent = `${u.name} (${u.company}). Tell them the new password; they can change it under My account.`;
        $('pwNew').value = '';
        $('pwError').textContent = '';
        $('pwDialog').dataset.id = u.id;
        $('pwDialog').showModal();
        return;
      }
      if (b.dataset.act === 'toggle' && u.active && !await IM.confirm({ title: 'Switch off this user?', message: `Switch off ${u.name}.`, detail: 'They can no longer sign in until you switch them back on.', confirmText: 'Switch off', danger: true })) return;
      b.disabled = true;
      try {
        if (b.dataset.act === 'toggle') await IM.api({ action: 'sysSetUserActive', id: u.id, active: !u.active });
        if (b.dataset.act === 'unlock') await IM.api({ action: 'sysUnlockUser', id: u.id });
        IM.setMsg('uStatus', 'Done.', 'ok');
        load();
      } catch (err) { IM.setMsg('uStatus', err.message, 'error'); b.disabled = false; }
    });
    $('pwCancel').addEventListener('click', () => $('pwDialog').close());
    $('pwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if ($('pwNew').value.length < 8) { $('pwError').textContent = 'At least 8 characters.'; return; }
      try {
        await IM.api({ action: 'sysResetPassword', id: $('pwDialog').dataset.id, password: $('pwNew').value });
        $('pwDialog').close();
        IM.setMsg('uStatus', 'Password set. Their other sessions were signed out.', 'ok');
        load();
      } catch (err) { $('pwError').textContent = err.message; }
    });
    load();
    setInterval(load, 60000);
  });
})();
