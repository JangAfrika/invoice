/* System Admin > Audience: who uses the app, on what, from where. */
(function () {
  const IM = window.IM;
  const { $, esc } = IM;
  let data = null;

  const CHARTS = [
    ['gender', 'Gender'], ['ages', 'Age'], ['devices', 'Device type'], ['browsers', 'Browser'], ['systems', 'System'],
    ['countries', 'Country'], ['cities', 'Top cities'], ['languages', 'Language'], ['origins', 'Where they came from']
  ];

  function chart(title, rows) {
    const max = Math.max(1, ...rows.map((r) => r.count));
    return `<section class="box"><h3 style="margin:0 0 8px;font-size:12.5px">${esc(title)}</h3>${rows.length ? rows.map((r) => `
      <div class="aud-row"><span class="aud-l" title="${esc(r.label)}">${esc(r.label)}</span><span class="aud-bar"><i style="width:${Math.max(2, Math.round(r.count / max * 100))}%"></i></span><b>${r.count}</b></div>`).join('') : '<div class="hint">No data yet.</div>'}</section>`;
  }

  const LEVEL = { act: ['Act on this', 'act'], watch: ['Keep an eye on this', 'watch'], good: ['Going well', 'good'] };

  function insights(a) {
    const order = { act: 0, watch: 1, good: 2 };
    const list = a.insights.slice().sort((x, y) => order[x.level] - order[y.level]);
    $('aInsights').innerHTML = list.map((i) => `
      <article class="aud-card ${esc(LEVEL[i.level][1])}">
        <div class="aud-tag">${esc(LEVEL[i.level][0])}</div>
        <h3>${esc(i.title)}</h3>
        <p>${esc(i.detail)}</p>
        <p class="aud-do"><b>What to do:</b> ${esc(i.action)}</p>
      </article>`).join('');
    $('aStalledWrap').hidden = !a.stalled.length;
    $('aStalled').innerHTML = a.stalled.map((c) => `<div class="aud-row2"><a href="sys-companies.html?id=${encodeURIComponent(c.id)}">${esc(c.name)}</a><span>${esc(c.status)} · signed up ${c.days} days ago</span></div>`).join('');
    const seg = (title, rows) => `<section class="box"><h3 style="margin:0 0 8px;font-size:12.5px">${esc(title)}</h3><table class="tbl"><thead><tr><th>Group</th><th class="num">People</th><th class="num">Using it</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${r.users}</td><td class="num"><b>${r.rate}%</b></td></tr>`).join('') || '<tr><td colspan="3" class="empty">No data yet.</td></tr>'}</tbody></table></section>`;
    const s = a.segments;
    $('aSegs').innerHTML = seg('By device', s.device) + seg('By age', s.age) + seg('By country', s.country) + seg('By where they came from', s.origin);
  }

  function csv() {
    const cols = [['name', 'Name'], ['email', 'Email'], ['company', 'Company'], ['role', 'Role'], ['gender', 'Gender'], ['age', 'Age'], ['deviceType', 'Device'], ['browser', 'Browser'], ['os', 'System'], ['screen', 'Screen'], ['language', 'Language'], ['country', 'Country'], ['city', 'City'], ['lat', 'Latitude'], ['lon', 'Longitude'], ['origin', 'First origin']];
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const text = [cols.map((c) => q(c[1])).join(',')].concat(data.people.map((p) => cols.map((c) => q(p[c[0]])).join(','))).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv' }));
    a.download = 'audience.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function renderPeople() {
    const q = $('search').value.trim().toLowerCase();
    const list = data.people.filter((p) => !q || [p.name, p.email, p.company, p.city, p.country, p.browser, p.os, p.origin].join(' ').toLowerCase().includes(q));
    $('aBody').innerHTML = list.length ? list.map((p) => `
      <tr>
        <td><b>${esc(p.name)}</b><span class="sub">${esc(p.company)} · ${esc(p.role)}</span></td>
        <td>${esc(p.gender || '—')}</td><td>${esc(p.age || '—')}</td>
        <td>${esc(p.deviceType || '—')}${p.screen ? `<span class="sub">${esc(p.screen)}</span>` : ''}</td>
        <td>${esc([p.browser, p.os].filter(Boolean).join(' / ') || '—')}${p.language ? `<span class="sub">${esc(p.language)}</span>` : ''}</td>
        <td>${esc([p.city, p.country].filter(Boolean).join(', ') || '—')}${p.lat !== '' ? `<span class="sub"><a href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(p.lat)}&mlon=${encodeURIComponent(p.lon)}#map=12/${encodeURIComponent(p.lat)}/${encodeURIComponent(p.lon)}" target="_blank" rel="noopener">${esc(p.lat)}, ${esc(p.lon)}</a></span>` : ''}</td>
        <td class="wrap">${esc(p.origin || 'Direct / unknown')}</td>
      </tr>`).join('') : '<tr><td colspan="7" class="empty">Nobody here.</td></tr>';
  }

  async function load() {
    IM.setMsg('aStatus', data ? '' : 'Loading…');
    try {
      data = await IM.api({ action: 'sysAudience' });
      $('aTotal').textContent = data.total; $('aDone').textContent = data.complete; $('aPos').textContent = data.withPosition;
      $('aCharts').innerHTML = CHARTS.map((c) => chart(c[1], data[c[0]])).join('');
      insights(data.analysis);
      renderPeople();
      IM.setMsg('aStatus', '');
    } catch (err) { IM.setMsg('aStatus', err.message, 'error'); }
  }

  IM.sysBoot({ page: 'audience', title: 'Audience' }).then(() => {
    $('reloadBtn').addEventListener('click', load);
    $('csvBtn').addEventListener('click', () => data && csv());
    $('search').addEventListener('input', () => data && renderPeople());
    load();
  });
})();
