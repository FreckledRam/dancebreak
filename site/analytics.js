// Breakers, Judges and Systems tabs: rankings and statistics computed by pipeline/analytics.py

// A sortable, paged table. cols: [key, heading, {num, fmt, tip}]; clicking a heading sorts by it.
function rankTable(el, pagerEl, cols, { pageSize = 50, onRow, sort, dir = -1, colspan } = {}) {
  let rows = [], page = 0, sortKey = sort, sortDir = dir, openKey = null, clicks = 0;   // clicks: presses on the sorted heading
  const value = (r, k) => (r[k] === null || r[k] === undefined ? -Infinity : r[k]);
  function draw() {
    const sorted = sortKey ? [...rows].sort((a, b) => {
      const x = value(a, sortKey), y = value(b, sortKey);
      return sortDir * (typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x - y);
    }) : rows;
    const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
    page = Math.min(page, pages - 1);
    el.innerHTML = `<thead><tr>${cols.map(([k, h, o = {}]) => `<th data-k="${k}" class="${o.num ? 'num' : ''}" ${o.tip ? `title="${esc(o.tip)}"` : ''}
      data-dir="${clicks && k === sortKey ? (sortDir === 1 ? 'asc' : 'desc') : ''}">${h}</th>`).join('')}</tr></thead><tbody>${
      sorted.slice(page * pageSize, (page + 1) * pageSize).map((r) => `<tr class="row ${r.k === openKey ? 'open' : ''}" data-key="${esc(r.k ?? '')}">${
        cols.map(([k, , o = {}]) => `<td class="${o.num ? 'num' : ''}">${o.fmt ? o.fmt(r) : r[k] === null || r[k] === undefined ? '<span class="muted">-</span>' : esc(r[k])}</td>`).join('')}</tr>`).join('')
      || `<tr><td colspan="${cols.length}" class="muted">Nothing matches.</td></tr>`}</tbody>`;
    if (pagerEl) {
      pagerEl.innerHTML = pages > 1 ? `<button ${page === 0 ? 'disabled' : ''} data-go="-1">Previous</button><span>Page ${page + 1} of ${pages}</span><button ${page >= pages - 1 ? 'disabled' : ''} data-go="1">Next</button>` : '';
    }
  }
  el.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-k]');
    if (th) {
      // first click sorts, second reverses, third goes back to the table's standard order
      const first = (k) => (typeof rows[0]?.[k] === 'string' ? 1 : -1);
      if (sortKey !== th.dataset.k || clicks === 0) { sortKey = th.dataset.k; sortDir = first(sortKey); clicks = 1; }
      else if (clicks === 1) { sortDir = -sortDir; clicks = 2; }
      else { sortKey = sort; sortDir = dir; clicks = 0; }
      page = 0; draw(); return;
    }
    const tr = e.target.closest('tr.row');
    if (!tr || !onRow || e.target.closest('tr.detail') || e.target.closest('a')) return;
    const wasOpen = tr.classList.contains('open');
    el.querySelectorAll('tr.detail').forEach((d) => d.remove());
    el.querySelectorAll('tr.open').forEach((r) => r.classList.remove('open'));
    openKey = null;
    if (wasOpen) return;
    const row = rows.find((r) => String(r.k) === tr.dataset.key);
    const detail = document.createElement('tr');
    detail.className = 'detail';
    detail.innerHTML = `<td colspan="${cols.length}">${onRow(row)}</td>`;
    tr.classList.add('open'); openKey = row.k;
    tr.after(detail);
  });
  pagerEl?.addEventListener('click', (e) => { if (e.target.dataset.go) { page += +e.target.dataset.go; draw(); } });
  return { set(next) { rows = next; page = 0; openKey = null; draw(); } };
}

const pctCell = (k) => ({ num: true, fmt: (r) => (r[k] === null || r[k] === undefined ? '<span class="muted">-</span>' : `${r[k]}%`) });
const years = (r) => (r.from ? (r.from === r.to ? r.from : `${r.from}–${r.to}`) : '<span class="muted">-</span>');

// Elo over time: one line, with the nearest point read out on hover
function eloChart(hist) {
  if (hist.length < 2) return '';
  const W = 640, H = 150, L = 40, R = 10, T = 10, B = 22;
  const vals = hist.map((h) => h[1]), lo = Math.min(...vals, 1500), hi = Math.max(...vals, 1500);
  const pad = Math.max(20, (hi - lo) * 0.1), y0 = lo - pad, y1 = hi + pad;
  const x = (i) => L + ((W - L - R) * i) / (hist.length - 1), y = (v) => T + ((H - T - B) * (y1 - v)) / (y1 - y0);
  const pts = hist.map((h, i) => `${x(i).toFixed(1)},${y(h[1]).toFixed(1)}`).join(' ');
  return `<div class="chart" data-hist='${esc(JSON.stringify(hist))}'>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Elo rating over time">
      <line class="grid" x1="${L}" x2="${W - R}" y1="${y(1500)}" y2="${y(1500)}"/>
      <text class="axis" x="${L - 6}" y="${y(1500) + 4}" text-anchor="end">1500</text>
      <text class="axis" x="${L - 6}" y="${y(hi) + 4}" text-anchor="end">${hi}</text>
      <text class="axis" x="${L}" y="${H - 4}">${hist[0][0] < '1990' ? '' : hist[0][0].slice(0, 4)}</text>
      <text class="axis" x="${W - R}" y="${H - 4}" text-anchor="end">${hist.at(-1)[0].slice(0, 4)}</text>
      <polyline class="line" points="${pts}"/>
      <circle class="dot" r="4" cx="${x(hist.length - 1)}" cy="${y(vals.at(-1))}"/>
      <line class="cross" y1="${T}" y2="${H - B}" x1="-9" x2="-9"/>
    </svg><span class="tip" hidden></span></div>`;
}
document.addEventListener('mousemove', (e) => {
  const chart = e.target.closest?.('.chart');
  if (!chart) return;
  const hist = JSON.parse(chart.dataset.hist), box = chart.querySelector('svg').getBoundingClientRect();
  const W = 640, L = 40, R = 10;
  const px = ((e.clientX - box.left) / box.width) * W;
  const i = Math.max(0, Math.min(hist.length - 1, Math.round(((px - L) / (W - L - R)) * (hist.length - 1))));
  const cx = L + ((W - L - R) * i) / (hist.length - 1);
  chart.querySelector('.cross').setAttribute('x1', cx); chart.querySelector('.cross').setAttribute('x2', cx);
  const tip = chart.querySelector('.tip');
  tip.hidden = false; tip.textContent = `${hist[i][0] < '1990' ? 'Undated' : hist[i][0].endsWith('-07-01') ? hist[i][0].slice(0, 4) : hist[i][0]} · ${hist[i][1]}`;
  tip.style.left = `${Math.min(box.width - 110, Math.max(0, (cx / W) * box.width - 50))}px`;
});

// a breaker's record, opponents and latest battles, worked out from the dataset rows already loaded
function breakerDetail(b) {
  if (!DATA) return '<span class="muted">Loading battles…</span>';
  const C = DATA.C, mine = DATA.rows.filter((r) => (r[C.rk] === b.k || r[C.bk] === b.k) && r[C.system] !== UNCERTAIN);
  const systems = {}, foes = {};
  for (const r of mine) {
    const red = r[C.rk] === b.k, me = red ? r[C.red] : r[C.blue], foe = red ? r[C.blue] : r[C.red];
    const won = r[C.winner] === me, lost = r[C.winner] === foe;
    const fk = red ? r[C.bk] : r[C.rk];
    const s = (systems[r[C.system]] ??= { w: 0, l: 0 }), f = (foes[fk] ??= { name: NAMES[fk] || foe, w: 0, l: 0 });
    if (won) { s.w++; f.w++; } else if (lost) { s.l++; f.l++; }
  }
  const latest = [...mine].sort((a, c) => String(c[C.date] || c[C.year] || '').localeCompare(String(a[C.date] || a[C.year] || ''))).slice(0, 8);
  const rivals = Object.values(foes).sort((a, c) => c.w + c.l - (a.w + a.l)).slice(0, 6);
  return `${eloChart(b.hist)}
  <div class="cols">
    <div><h4>Record by system</h4><table>${Object.entries(systems).sort((a, c) => c[1].w + c[1].l - a[1].w - a[1].l).map(([s, v]) => `<tr><td>${esc(s)}</td><td class="num">${v.w}–${v.l}</td></tr>`).join('')}</table></div>
    <div><h4>Most faced</h4><table>${rivals.map((f) => `<tr><td>${esc(f.name)}</td><td class="num">${f.w}–${f.l}</td></tr>`).join('')}</table></div>
    <div class="wide"><h4>Latest battles</h4><table>${latest.map((r) => {
      const red = r[C.rk] === b.k, me = red ? r[C.red] : r[C.blue], foe = red ? r[C.blue] : r[C.red];
      const res = r[C.winner] === me ? 'Won' : r[C.winner] === foe ? 'Lost' : 'Tie';
      return `<tr><td class="muted" style="white-space:nowrap">${r[C.date] || r[C.year] || ''}</td><td style="white-space:nowrap">${res} vs ${esc(NAMES[red ? r[C.bk] : r[C.rk]] || foe)}</td><td class="muted">${esc(r[C.event])}</td></tr>`;
    }).join('')}</table></div>
  </div>
  <p class="key"><a data-find="${esc(b.name)}">All ${mine.length} battles in the dataset</a></p>`;
}

function judgeDetail(j) {
  return `<div class="cols"><div><h4>Battles judged by system</h4><table>${j.systems.map(([s, n]) => `<tr><td>${esc(s)}</td><td class="num">${n.toLocaleString()}</td></tr>`).join('')}</table></div></div>
  <p class="key"><a data-find="${esc(j.name)}">All battles this judge sat on</a></p>`;
}

// "All battles" links jump to the Dataset tab searched for that name
document.addEventListener('click', (e) => {
  const name = e.target.dataset?.find;
  if (!name || !DATA) return;
  Object.keys(colFilters).forEach((k) => delete colFilters[k]);
  qualityCode = null; sortCol = null; $('#q').value = name; page = 0;
  filter();
  location.hash = '#dataset';
});

const NAMES = {};      // person key -> the spelling used most often

get('data/analytics.json').then((A) => {
  let rank = 0;
  A.breakers.forEach((b) => { NAMES[b.k] = b.name; });
  A.breakers.forEach((b) => { b.rank = b.n >= A.min_battles ? ++rank : null; b.pct = b.w + b.l ? Math.round((100 * b.w) / (b.w + b.l)) : null; });
  const breakers = rankTable($('#breakers-table'), $('#breakers-pager'), [
    ['rank', '#', { num: true }],
    ['name', 'Breaker', { fmt: (r) => `<b>${esc(r.name)}</b>` }],
    ['elo', 'Elo', { num: true, fmt: (r) => `<b>${r.elo}</b>` }],
    ['peak', 'Peak', { num: true }],
    ['w', 'Won–lost', { num: true, fmt: (r) => `${r.w}–${r.l}` }],
    ['pct', 'Win %', pctCell('pct')],
    ['vote_share', 'Judge votes %', { ...pctCell('vote_share'), tip: 'Share of all judge votes in their battles that went their way' }],
    ['events', 'Events', { num: true }],
    ['div', 'Division'],
    ['to', 'Active', { fmt: years }],
  ], { onRow: breakerDetail });
  const showBreakers = () => {
    const q = $('#bq').value.trim().toLowerCase(), d = $('#bdiv .on').dataset.v;
    breakers.set(A.breakers.filter((b) => (!d || b.div === d) && (!q || b.name.toLowerCase().includes(q))));
  };
  $('#bq').oninput = showBreakers;
  $('#bdiv').onclick = (e) => {
    if (!e.target.dataset || e.target.dataset.v === undefined) return;
    $('#bdiv .on').classList.remove('on'); e.target.classList.add('on');
    showBreakers();
  };
  showBreakers();

  const judges = rankTable($('#judges-table'), $('#judges-pager'), [
    ['name', 'Judge', { fmt: (r) => `<b>${esc(r.name)}</b>` }],
    ['battles', 'Battles', { num: true, fmt: (r) => r.battles.toLocaleString() }],
    ['events', 'Events', { num: true }],
    ['with', 'With majority', pctCell('with')],
    ['alone', 'Lone dissent', pctCell('alone')],
    ['red', 'Votes for red', pctCell('red')],
    ['to', 'Active', { fmt: years }],
  ], { onRow: judgeDetail, sort: 'battles' });
  const showJudges = () => { const q = $('#jq').value.trim().toLowerCase(); judges.set(A.judges.filter((j) => !q || j.name.toLowerCase().includes(q))); };
  $('#jq').oninput = showJudges;
  showJudges();

  rankTable($('#systems-table'), null, [
    ['system', 'System', { fmt: (r) => `<b>${esc(r.system)}</b>` }],
    ['battles', 'Battles', { num: true, fmt: (r) => r.battles.toLocaleString() }],
    ['events', 'Events', { num: true }],
    ['to', 'Years', { fmt: years }],
    ['judges', 'Judges', { num: true }],
    ['rounds', 'Rounds', { num: true }],
    ['unanimous', 'Unanimous', pctCell('unanimous')],
    ['one_vote', 'One-vote', pctCell('one_vote')],
    ['red_wins', 'Red wins', pctCell('red_wins')],
    ['ties', 'Ties', { num: true }],
  ], { sort: 'battles' }).set(A.systems.map((s) => ({ ...s, k: s.system })));
});
