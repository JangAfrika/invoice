/* Other income: money received that is not an invoice payment (invoice payments count automatically). */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  const Acc = IM.Acc;
  let all = [], cats = [], methods = [], editing = null;

  function filtered() {
    const r = Acc.range($('inPeriod').value);
    const q = $('inSearch').value.trim().toLowerCase();
    return all.filter((e) => e.date >= r.from && e.date <= r.to && (!q || [e.source, e.category, e.description, e.reference].join(' ').toLowerCase().includes(q)));
  }

  function render() {
    const list = filtered();
    $('inSummary').textContent = list.length ? `${list.length} entr${list.length === 1 ? 'y' : 'ies'} · ${IM.money(list.reduce((s, e) => s + e.amount, 0))}` : '';
    $('inBody').innerHTML = list.length ? list.map((e) => `
      <tr data-href="income.html?id=${encodeURIComponent(e.id)}">
        <td>${esc(IM.shortDate(e.date))}</td>
        <td><b>${IM.lnk('income.html?id=' + encodeURIComponent(e.id), e.source, 'plain')}</b>${e.description ? `<span class="sub">${esc(e.description)}</span>` : ''}</td>
        <td>${esc(e.category)}</td>
        <td class="num">${IM.money(e.amount)}</td>
        <td>${esc(e.method || '')}</td>
        <td><div class="acts"><button type="button" data-act="edit" data-id="${esc(e.id)}">Edit</button><button type="button" class="danger" data-act="delete" data-id="${esc(e.id)}">Delete</button></div></td>
      </tr>`).join('')
      : `<tr><td colspan="6" class="empty">${all.length ? 'Nothing matches these filters.' : 'No other income yet. Money paid on invoices is counted automatically; add anything else here (cash sales, interest, grants).'}</td></tr>`;
  }

  async function load() {
    IM.setMsg('inStatus', all.length ? '' : 'Loading…');
    try {
      const d = await IM.api({ action: 'accLists', from: '2000-01-01' });
      all = d.income; cats = d.incomeCategories; methods = d.methods;
      IM.setMsg('inStatus', '');
      render();
    } catch (err) { IM.setMsg('inStatus', err.message, 'error'); }
  }

  function openDialog(e) {
    editing = e || null;
    $('inTitle').textContent = e ? 'Edit income' : 'Add income';
    $('iDate').value = e ? e.date : IM.todayISO();
    $('iDate').max = IM.todayISO();
    $('iSource').value = e ? e.source : '';
    $('iAmount').value = e ? e.amount : '';
    $('iCat').value = e ? e.category : '';
    $('iCatList').innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');
    $('iMethod').innerHTML = '<option value=""></option>' + Array.from(new Set(methods.concat(e && e.method ? [e.method] : []))).map((m) => `<option${e && e.method === m ? ' selected' : ''}>${esc(m)}</option>`).join('');
    $('iRef').value = e ? e.reference : '';
    $('iDesc').value = e ? e.description : '';
    $('inError').textContent = '';
    $('inDialog').showModal();
  }

  IM.boot({ page: 'other-income', fin: true }).then(() => {
    $('inPeriod').innerHTML = Acc.periodOptions('year');
    $('inPeriod').addEventListener('change', render);
    $('inSearch').addEventListener('input', render);
    $('addBtn').addEventListener('click', () => openDialog(null));
    $('inCancel').addEventListener('click', () => $('inDialog').close());
    $('inForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const amount = Number($('iAmount').value);
      if ($('iSource').value.trim().length < 2) { $('inError').textContent = 'Enter where the money came from.'; return; }
      if (!(amount > 0)) { $('inError').textContent = 'Enter the amount received.'; return; }
      $('inSave').disabled = true;
      try {
        await IM.api({ action: 'saveIncome', income: { id: editing ? editing.id : '', source: $('iSource').value.trim(), date: $('iDate').value, amount,
          category: $('iCat').value.trim(), method: $('iMethod').value, reference: $('iRef').value.trim(), description: $('iDesc').value.trim() } });
        IM.track(editing ? 'income_updated' : 'income_added');
        $('inDialog').close();
        await load();
        IM.setMsg('inStatus', 'Income saved.', 'ok');
      } catch (err) { $('inError').textContent = err.message; }
      $('inSave').disabled = false;
    });
    IM.clickable($('inBody'));
    $('inBody').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const x = all.find((i) => i.id === b.dataset.id);
      if (!x) return;
      if (b.dataset.act === 'edit') return openDialog(x);
      if (!await IM.confirm({ title: 'Delete income?', message: `Delete the ${IM.money(x.amount)} received from ${x.source} on ${IM.shortDate(x.date)}.`, detail: 'This cannot be undone.', confirmText: 'Delete', danger: true })) return;
      try { await IM.api({ action: 'deleteIncome', id: x.id }); IM.track('income_deleted'); await load(); IM.setMsg('inStatus', 'Income deleted.', 'ok'); }
      catch (err) { IM.setMsg('inStatus', err.message, 'error'); }
    });
    if (IM.param('q')) $('inSearch').value = IM.param('q');
    load().then(() => {
      if (IM.param('add')) openDialog(null);
      const o = IM.param('open') && all.find((x) => x.id === IM.param('open'));
      if (o) openDialog(o);
    });
  });
})();
