/* Customers: contact details plus what each one has been invoiced, has paid and still owes. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  let customers = [], invoices = [];
  let editingId = null;

  function totals() {
    const t = {};
    invoices.forEach((i) => {
      if (i.status === 'Cancelled') return;
      const x = t[i.customerId] || (t[i.customerId] = { n: 0, total: 0, paid: 0, balance: 0 });
      x.n++; x.total += i.total; x.paid += i.paid; x.balance += i.balance;
    });
    return t;
  }

  function render() {
    const t = totals();
    const q = $('search').value.trim().toLowerCase();
    const showArchived = $('showArchived').checked;
    const list = customers
      .filter((c) => showArchived || c.active)
      .filter((c) => !q || [c.name, c.phone, c.email, c.address].some((v) => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!list.length) {
      $('custBody').innerHTML = `<tr><td colspan="7" class="empty">${customers.length ? 'No customers match.' : 'No customers yet. Add one, or just type a new name when you create an invoice.'}</td></tr>`;
      return;
    }
    $('custBody').innerHTML = list.map((c) => {
      const x = t[c.id] || { n: 0, total: 0, paid: 0, balance: 0 };
      const contact = [c.phone, c.email].filter(Boolean).map(esc).join('<br>');
      return `
        <tr>
          <td class="wrap"><b>${esc(c.name)}</b>${c.active ? '' : ' <span class="pill off">archived</span>'}${c.address ? `<span class="sub">${esc(c.address)}</span>` : ''}</td>
          <td class="wrap">${contact || '<span class="sub">—</span>'}</td>
          <td class="num">${x.n}</td>
          <td class="num">${IM.money(x.total)}</td>
          <td class="num">${IM.money(x.paid)}</td>
          <td class="num">${x.balance > 0.005 ? '<b>' + IM.money(x.balance) + '</b>' : IM.money(0)}</td>
          <td><div class="acts">
            <a href="invoice-new.html?customer=${encodeURIComponent(c.id)}">Invoice</a>
            ${x.n ? `<a href="invoices.html?customer=${encodeURIComponent(c.id)}">View invoices</a>` : ''}
            <button type="button" data-act="edit" data-id="${esc(c.id)}">Edit</button>
            ${c.active ? `<button type="button" data-act="delete" data-id="${esc(c.id)}">${x.n ? 'Archive' : 'Delete'}</button>` : ''}
          </div></td>
        </tr>`;
    }).join('');
  }

  async function load() {
    IM.setMsg('custStatus', 'Loading…');
    try {
      await IM.loadList((data, cached) => {
        customers = data.customers; invoices = data.invoices;
        render();
        IM.setMsg('custStatus', cached ? 'Updating…' : '');
      });
      IM.setMsg('custStatus', '');
    } catch (err) {
      IM.setMsg('custStatus', err.message, 'error');
    }
  }

  function openDialog(c) {
    editingId = c ? c.id : null;
    $('custTitle').textContent = c ? 'Edit customer' : 'Add customer';
    $('cName').value = c ? c.name : '';
    $('cPhone').value = c ? c.phone : '';
    $('cEmail').value = c ? c.email : '';
    $('cAddress').value = c ? c.address : '';
    $('cNotes').value = c ? c.notes : '';
    $('cActive').checked = c ? c.active : true;
    $('cActiveWrap').hidden = !c;
    $('custError').textContent = '';
    $('custDialog').showModal();
    $('cName').focus();
  }

  IM.boot({ page: 'customers' }).then(() => {
    $('search').addEventListener('input', render);
    $('showArchived').addEventListener('change', render);
    $('reloadBtn').addEventListener('click', load);
    $('addBtn').addEventListener('click', () => openDialog(null));
    if (IM.param('add')) openDialog(null);
    $('custCancel').addEventListener('click', () => $('custDialog').close());

    $('custForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('cName').value.trim();
      if (name.length < 2) { $('custError').textContent = 'Enter the customer name.'; return; }
      $('custSave').disabled = true;
      try {
        await IM.api({ action: 'saveCustomer', customer: {
          id: editingId, name, phone: $('cPhone').value.trim(), email: $('cEmail').value.trim(),
          address: $('cAddress').value.trim(), notes: $('cNotes').value.trim(), active: $('cActive').checked
        } });
        IM.dropList();
        IM.track(editingId ? 'customer_updated' : 'customer_created');
        $('custDialog').close();
        await load();
      } catch (err) {
        $('custError').textContent = err.message;
      } finally {
        $('custSave').disabled = false;
      }
    });

    $('custBody').addEventListener('click', async (e) => {
      const act = e.target.dataset.act;
      const c = customers.find((x) => x.id === e.target.dataset.id);
      if (!act || !c) return;
      if (act === 'edit') return openDialog(c);
      if (act === 'delete') {
        if (!await IM.confirm({ title: 'Remove customer?', message: `Remove ${c.name} from your customers.`, detail: 'A customer with invoices is archived and kept for your records. A customer with no invoices is deleted.', confirmText: 'Remove', danger: true })) return;
        try {
          IM.setMsg('custStatus', 'Updating…');
          const out = await IM.api({ action: 'deleteCustomer', id: c.id });
          IM.dropList();
          await load();
          IM.setMsg('custStatus', out.archived ? c.name + ' archived.' : c.name + ' deleted.', 'ok');
        } catch (err) {
          IM.setMsg('custStatus', err.message, 'error');
        }
      }
    });
    load();
  });
})();
