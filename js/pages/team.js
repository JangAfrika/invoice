/* Team (Owner / Admin): add people, change roles, switch sign-in off, set a new password. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  let users = [];
  let editing = null;
  let resetting = null;

  // what the signed-in person may change (the server checks this too)
  const canManage = (u) => u.id !== IM.user.id && u.role !== 'Owner' && (u.role === 'Staff' || IM.user.role === 'Owner');

  function render() {
    if (!users.length) { $('teamBody').innerHTML = '<tr><td colspan="6" class="empty">No team members.</td></tr>'; return; }
    const order = { Owner: 0, Admin: 1, Staff: 2 };
    $('teamBody').innerHTML = users.slice().sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name)).map((u) => `
      <tr>
        <td><b>${esc(u.name)}</b>${u.id === IM.user.id ? ' <span class="sub" style="display:inline">(you)</span>' : ''}</td>
        <td>${esc(u.email || u.username)}${u.email && u.username !== u.email ? `<span class="sub">or ${esc(u.username)}</span>` : ''}</td>
        <td><span class="pill role">${esc(u.role)}</span></td>
        <td><span class="pill ${u.active ? 'active' : 'off'}">${u.active ? 'Active' : 'Switched off'}</span></td>
        <td>${u.lastLogin ? esc(IM.dateTime(u.lastLogin)) : '<span class="sub">never</span>'}</td>
        <td><div class="acts">
          ${canManage(u) ? `<button type="button" data-act="edit" data-id="${esc(u.id)}">Edit</button>
            <button type="button" data-act="reset" data-id="${esc(u.id)}">New password</button>` : (u.id === IM.user.id ? '<a href="account.html">My account</a>' : '')}
        </div></td>
      </tr>`).join('');
  }

  async function load() {
    IM.setMsg('teamStatus', 'Loading…');
    try {
      users = (await IM.api({ action: 'listUsers' })).users;
      render();
      IM.setMsg('teamStatus', '');
    } catch (err) {
      IM.setMsg('teamStatus', err.message, 'error');
    }
  }

  function openMember(u) {
    editing = u;
    $('memberTitle').textContent = u ? 'Edit ' + u.name : 'Add team member';
    $('mName').value = u ? u.name : '';
    $('mEmail').value = u ? u.email : '';
    $('mUsername').value = u && u.username !== u.email ? u.username : '';
    $('mRole').value = u ? u.role : 'Staff';
    $('mRole').querySelector('option[value="Admin"]').disabled = IM.user.role !== 'Owner';
    $('mPass').value = '';
    $('mPassWrap').hidden = !!u;
    $('mActive').checked = u ? u.active : true;
    $('mActiveWrap').hidden = !u;
    $('memberError').textContent = '';
    $('memberDialog').showModal();
    $('mName').focus();
  }

  IM.boot({ page: 'team', admin: true }).then(() => {
    $('addBtn').addEventListener('click', () => openMember(null));
    $('memberCancel').addEventListener('click', () => $('memberDialog').close());
    $('resetCancel').addEventListener('click', () => $('resetDialog').close());

    $('memberForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = (m) => { $('memberError').textContent = m; };
      const m = {
        id: editing ? editing.id : '',
        name: $('mName').value.trim(), email: $('mEmail').value.trim(), username: $('mUsername').value.trim(),
        role: $('mRole').value, password: $('mPass').value, active: $('mActive').checked
      };
      if (m.name.length < 2) return err('Enter the full name.');
      if (!m.email && !m.username) return err('Give an email or a username so they can sign in.');
      if (!editing && m.password.length < 8) return err('Set a starting password of at least 8 characters.');
      $('memberSave').disabled = true;
      try {
        await IM.api({ action: 'saveUser', user: m });
        $('memberDialog').close();
        await load();
        IM.setMsg('teamStatus', editing ? 'Saved.' : `${m.name} can now sign in with ${m.username || m.email} and the starting password.`, 'ok');
      } catch (e2) {
        err(e2.message);
      } finally {
        $('memberSave').disabled = false;
      }
    });

    $('resetForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = $('rPass').value;
      if (pw.length < 8) { $('resetError').textContent = 'At least 8 characters.'; return; }
      $('resetSave').disabled = true;
      try {
        await IM.api({ action: 'resetMemberPassword', id: resetting.id, password: pw });
        $('resetDialog').close();
        IM.setMsg('teamStatus', `New password set for ${resetting.name}. Their other sign-ins have ended.`, 'ok');
      } catch (e2) {
        $('resetError').textContent = e2.message;
      } finally {
        $('resetSave').disabled = false;
      }
    });

    $('teamBody').addEventListener('click', (e) => {
      const u = users.find((x) => x.id === e.target.dataset.id);
      if (!u) return;
      if (e.target.dataset.act === 'edit') openMember(u);
      if (e.target.dataset.act === 'reset') {
        resetting = u;
        $('resetInfo').textContent = `For ${u.name}. Tell them the new password; they can change it under My account.`;
        $('rPass').value = '';
        $('resetError').textContent = '';
        $('resetDialog').showModal();
        $('rPass').focus();
      }
    });
    load();
  });
})();
