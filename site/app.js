const $ = (s) => document.querySelector(s);
const PAGE = 50;
const SOURCE_NAMES = { seed: 'Original', and8: 'And8', wdsf: 'WDSF', breakkonnect: 'Break Konnect' };
const STATUS_TEXT = { pending: 'Not automated yet', ok: 'Working', repairing: 'Repairing parser', broken: 'Needs attention' };
const SYSTEMS = ['Traditional', 'RoundByRound', 'SingleSlider', 'Threefold', 'PseudoThreefold', 'Trivium', 'WDSFSystem'];

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const get = (path) => fetch(path).then((r) => r.json());

function ago(iso) {
  if (!iso) return '<span class="muted">Never</span>';
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  const text = mins < 1 ? 'Just now' : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`;
  return `<span title="${esc(new Date(iso).toLocaleString())}">${text}</span>`;
}

// ---- tabs
function showTab() {
  const tab = ['sources', 'dataset', 'review', 'activity'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'sources';
  document.querySelectorAll('main section').forEach((s) => { s.hidden = s.id !== tab; });
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.hash === '#' + tab));
}
addEventListener('hashchange', showTab);
showTab();

// ---- sources + activity
function renderStatus(status, activity) {
  $('#totals').innerHTML = [
    [status.battles.toLocaleString(), 'battles'],
    [status.events.toLocaleString(), 'events'],
    [ago(status.last_run), 'last check'],
  ].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');

  $('#sources-table tbody').innerHTML = Object.entries(status.sources).map(([key, s]) => `<tr>
    <td><a href="${esc(s.url)}">${esc(s.name)}</a></td>
    <td data-label="Status"><span class="status ${esc(s.status)}">${STATUS_TEXT[s.status] || esc(s.status)}</span>${s.events_pending ? `<div class="note">${s.events_pending} events waiting</div>` : ''}${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}</td>
    <td data-label="Last checked">${ago(s.last_checked)}</td>
    <td data-label="Last new data">${ago(s.last_changed)}</td>
    <td data-label="Newest event">${s.newest_event ? `${esc(s.newest_event)} <span class="muted">${esc(s.newest_date || '')}</span>` : '<span class="muted">-</span>'}</td>
    <td data-label="Battles" class="num">${(status.battles_by_source[key] || 0).toLocaleString()}</td>
  </tr>`).join('');

  const seeded = status.battles_by_source.seed || 0;
  $('#sources-note').textContent = seeded ? `${seeded.toLocaleString()} battles come from the original hand-collected dataset.` : '';

  $('#activity-table tbody').innerHTML = activity.map((a) => `<tr>
    <td style="white-space:nowrap">${esc(new Date(a.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}</td>
    <td>${esc(SOURCE_NAMES[a.source] || a.source || '')}</td>
    <td>${esc(a.text)}</td>
  </tr>`).join('') || '<tr><td colspan="3" class="muted">Nothing yet.</td></tr>';
}

// ---- dataset
let DATA = null, rows = [], page = 0;
const eventCache = {};

function option(sel, value, label) { sel.add(new Option(label ?? value, value)); }

function setupDataset(data) {
  DATA = data;
  const C = Object.fromEntries(data.cols.map((c, i) => [c, i]));
  DATA.C = C;
  DATA.text = data.rows.map((r) => [r[C.event], r[C.stage], r[C.red], r[C.blue], r[C.judge_names]].join(' ').toLowerCase());
  SYSTEMS.forEach((s) => option($('#f-system'), s));
  [...new Set(data.rows.map((r) => r[C.year]).filter(Boolean))].sort((a, b) => b - a).forEach((y) => option($('#f-year'), y));
  [...new Set(data.rows.map((r) => r[C.source]))].forEach((s) => option($('#f-source'), s, SOURCE_NAMES[s] || s));
  $('#downloads').innerHTML = SYSTEMS.map((s) => `<a href="data/export/${s}DataRaw.tsv" download>${s}</a>`).join(', ');
  ['#q', '#f-system', '#f-year', '#f-source'].forEach((id) => $(id).addEventListener('input', () => { page = 0; filter(); }));
  $('#prev').onclick = () => { page--; draw(); };
  $('#next').onclick = () => { page++; draw(); };
  filter();
}

function filter() {
  const C = DATA.C;
  const words = $('#q').value.toLowerCase().split(/\s+/).filter(Boolean);
  const sys = $('#f-system').value, year = $('#f-year').value, src = $('#f-source').value;
  rows = [];
  DATA.rows.forEach((r, i) => {
    if (sys && r[C.system] !== sys) return;
    if (year && String(r[C.year]) !== year) return;
    if (src && r[C.source] !== src) return;
    if (words.length && !words.every((w) => DATA.text[i].includes(w))) return;
    rows.push(r);
  });
  draw();
}

function draw() {
  const C = DATA.C;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  page = Math.min(Math.max(page, 0), pages - 1);
  $('#count').textContent = `${rows.length.toLocaleString()} battles`;
  $('#page').textContent = `Page ${page + 1} of ${pages}`;
  $('#prev').disabled = page === 0;
  $('#next').disabled = page >= pages - 1;
  const name = (r, side) => `<td class="${r[C.winner] && r[C.winner] === r[C[side]] ? 'win' : ''}">${esc(r[C[side]])}</td>`;
  $('#battles tbody').innerHTML = rows.slice(page * PAGE, (page + 1) * PAGE).map((r) => `<tr class="row" data-f="${r[C.file]}" data-i="${r[C.idx]}">
    <td>${r[C.year] || ''}</td><td>${esc(r[C.event])}</td><td>${esc(r[C.stage])}</td>
    ${name(r, 'red')}${name(r, 'blue')}
    <td>${esc(r[C.system])}</td><td class="num">${r[C.judges]}</td>
    <td>${r[C.url] ? `<a href="${esc(r[C.url])}" target="_blank" rel="noopener">${esc(SOURCE_NAMES[r[C.source]] || r[C.source])}</a>` : `<span class="muted">${esc(SOURCE_NAMES[r[C.source]] || r[C.source])}</span>`}</td>
  </tr>`).join('');
}

$('#battles tbody').addEventListener('click', async (e) => {
  if (e.target.closest('a')) return;
  const tr = e.target.closest('tr.row');
  if (!tr) return;
  if (tr.nextElementSibling?.classList.contains('detail')) { tr.nextElementSibling.remove(); return; }
  const file = DATA.files[tr.dataset.f];
  eventCache[file] ??= await get('data/events/' + file);
  const detail = document.createElement('tr');
  detail.className = 'detail';
  detail.innerHTML = `<td colspan="8">${scoreTables(eventCache[file].battles[tr.dataset.i])}</td>`;
  tr.after(detail);
});

// rounds x judges grid from the r#j#cate cells
function scoreTables(b) {
  const rounds = {};
  for (const [key, value] of Object.entries(b.cells)) {
    const m = key.match(/^(?:r(\d+))?j(\d+)([a-z0-9]+)$/);
    if (!m) continue;
    const r = m[1] || '0';
    ((rounds[r] ??= {})[m[2]] ??= {})[m[3]] = value;
  }
  const keys = Object.keys(rounds).sort((a, c) => a - c);
  if (!keys.length) return '<span class="muted">No judge-level scores recorded.</span>';
  let html = '';
  for (const r of keys) {
    const cats = [...new Set(Object.values(rounds[r]).flatMap((j) => Object.keys(j)))];
    html += `<h4>${r === '0' ? 'Votes' : 'Round ' + r}</h4><table><thead><tr><th>Judge</th>${cats.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>`;
    for (const j of Object.keys(rounds[r]).sort((a, c) => a - c)) {
      html += `<tr><td>${esc(b.judges[j - 1] || 'Judge ' + j)}</td>${cats.map((c) => `<td>${esc(rounds[r][j][c] ?? '')}</td>`).join('')}</tr>`;
    }
    html += '</tbody></table>';
  }
  return html + `<p class="note">Negative favors red (${esc(b.red)}), positive favors blue (${esc(b.blue)}).</p>`;
}

Promise.all([get('data/status.json'), get('data/activity.json')]).then(([s, a]) => renderStatus(s, a));
get('data/review.json').then((items) => {
  $('#review-table tbody').innerHTML = items.map((r) => `<tr>
    <td style="white-space:nowrap">${esc(r.date)}</td><td>${esc(r.event)}</td>
    <td>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.stage)}</a>` : esc(r.stage)}</td>
    <td>${esc(r.reason)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nothing needs review.</td></tr>';
});
get('data/battles.json').then(setupDataset);
