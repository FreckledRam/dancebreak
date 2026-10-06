// Breakers, Judges and Systems tabs: rankings and statistics computed by pipeline/analytics.py

// A paged table that works like a spreadsheet. cols: [key, heading, {num, fmt, tip, csv}].
// Clicking a heading opens a menu: put the column in order either way, and filter it (text that it
// contains, or a lowest and highest number). The rows left can be downloaded as a CSV.
// csv: [[heading, fn], ...] when a column should be written as different columns than it is shown.
function rankTable(el, pagerEl, cols, { pageSize = 50, onRow, sort, dir = -1, tools, file = 'table', title } = {}) {
  let rows = [], page = 0, sortKey = sort, sortDir = dir, openKey = null, chosen = false;    // chosen: the visitor picked the order
  const filters = {};                 // column key -> { text } (contains) or { groups, on } (ticked groups of values)
  const blank = (v) => v === null || v === undefined || v === '';
  const passes = (r) => Object.entries(filters).every(([k, f]) => {
    if (f.text !== undefined) return String(r[k] ?? '').toLowerCase().includes(f.text);
    return f.groups.some((g, i) => f.on.has(i) && g.has(r[k]));
  });

  // The choices a column's menu offers. A column with only a few different values lists each one. A column of
  // continuous numbers (a rating, a percentage) is cut into about five ranges holding similar numbers of rows,
  // at round figures. A column of many different words gets no list, only a "contains" box.
  function groupsOf(k) {
    const vals = rows.map((r) => r[k]).filter((v) => !blank(v)), distinct = [...new Set(vals)];
    const out = [], by = cols.find((c) => c[0] === k)[2]?.group;
    if (by) {                                           // the column says how its values group (a date by its year, say)
      [...new Set(vals.map(by.of))].sort().forEach((g) => out.push({ label: by.label ? by.label(g) : g, has: (x) => !blank(x) && by.of(x) === g }));
    } else if (typeof vals[0] !== 'number') {
      if (distinct.length > 40) return null;
      distinct.sort((a, b) => String(a).localeCompare(String(b))).forEach((v) => out.push({ label: String(v), has: (x) => x === v }));
    } else if (distinct.length <= 10 || distinct.every((v) => Number.isInteger(v) && v > 1900 && v < 2100)) {
      // few enough to list one by one; years always are, and are written without a thousands comma
      const year = distinct.every((v) => Number.isInteger(v) && v > 1900 && v < 2100);
      distinct.sort((a, b) => a - b).forEach((v) => out.push({ label: year ? String(v) : v.toLocaleString(), has: (x) => x === v }));
    } else {
      vals.sort((a, b) => a - b);
      const whole = vals.every(Number.isInteger);
      const round = (x) => { const unit = Math.pow(10, Math.max(whole ? 0 : -1, Math.floor(Math.log10(Math.abs(x) || 1)) - 1)); return +(Math.round(x / unit) * unit).toFixed(1); };
      const at = (q) => vals[Math.floor(q * (vals.length - 1))];
      let cuts = [...new Set([0.2, 0.4, 0.6, 0.8].map((q) => round(at(q))))].filter((c) => c > vals[0] && c <= vals.at(-1));
      if (cuts.length < 3) {
        // most rows sit on a few values (a rating everyone starts at, say): cut the range into even, round steps instead
        const lo = at(0.03), hi = at(0.97), raw = (hi - lo) / 5 || 1, pow = Math.pow(10, Math.floor(Math.log10(raw)));
        const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((x) => x >= raw);
        cuts = [];
        for (let c = Math.ceil(lo / step) * step; c <= hi && cuts.length < 6; c += step) if (c > vals[0]) cuts.push(+c.toFixed(2));
      }
      const say = (n) => n.toLocaleString(), last = (hi) => (whole ? say(hi - 1) : `under ${say(hi)}`);
      const span = (lo, hi) => (whole && hi - lo === 1 ? say(lo) : `${say(lo)} to ${last(hi)}`);
      [-Infinity, ...cuts].forEach((lo, i) => {
        const hi = i < cuts.length ? cuts[i] : Infinity;
        out.push({ label: lo === -Infinity ? `Under ${say(hi)}` : hi === Infinity ? `${say(lo)} and over` : span(lo, hi), has: (x) => !blank(x) && x >= lo && x < hi });
      });
    }
    if (rows.some((r) => blank(r[k]))) out.push({ label: '(blank)', has: blank });
    out.forEach((g) => { g.count = rows.reduce((n, r) => n + g.has(r[k]), 0); });
    return out;
  }
  function view() {
    const kept = Object.keys(filters).length ? rows.filter(passes) : rows;
    if (!sortKey) return kept;
    return [...kept].sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      if (blank(x) || blank(y)) return blank(x) === blank(y) ? 0 : blank(x) ? 1 : -1;      // blanks go last, whichever way
      return sortDir * (typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y), undefined, { sensitivity: 'base' }) : x - y);
    });
  }

  const bar = document.createElement('span');
  bar.className = 'rank-tools';
  bar.innerHTML = '<button data-act="clear" hidden>Clear filters</button><button data-act="save" class="save-as">Download as</button>';
  tools?.append(bar);

  function draw() {
    const sorted = view();
    const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
    page = Math.min(page, pages - 1);
    el.innerHTML = `<thead><tr>${cols.map(([k, h, o = {}]) => `<th data-k="${k}" class="${o.num ? 'num' : ''} ${k in filters ? 'filtered' : ''}" ${o.tip ? `title="${esc(o.tip)}"` : ''}
      data-dir="${chosen && k === sortKey ? (sortDir === 1 ? 'asc' : 'desc') : ''}">${h}</th>`).join('')}</tr></thead><tbody>${
      sorted.slice(page * pageSize, (page + 1) * pageSize).map((r) => `<tr class="row ${r.k === openKey ? 'open' : ''}" data-key="${esc(r.k ?? '')}">${
        cols.map(([k, , o = {}]) => `<td class="${o.num ? 'num' : ''}">${o.fmt ? o.fmt(r) : blank(r[k]) ? '<span class="muted">-</span>' : esc(r[k])}</td>`).join('')}</tr>`).join('')
      || `<tr><td colspan="${cols.length}" class="muted">Nothing matches.</td></tr>`}</tbody>`;
    if (pagerEl) {
      pagerEl.innerHTML = pages > 1 ? `<button ${page === 0 ? 'disabled' : ''} data-go="-1">Previous</button><span>Page ${page + 1} of ${pages}</span><button ${page >= pages - 1 ? 'disabled' : ''} data-go="1">Next</button>` : '';
    }
    bar.querySelector('[data-act="clear"]').hidden = !(chosen || Object.keys(filters).length);
    bar.querySelector('[data-act="save"]').textContent = sorted.length === rows.length ? 'Download as' : `Download ${sorted.length.toLocaleString()} rows as`;
  }

  // the rows as shown (every page of them), in the order shown
  function download(format) {
    const out = cols.flatMap(([k, h, o = {}]) => o.csv || [[h, (r) => r[k]]]), shown = view();
    const data = shown.map((r) => out.map(([, fn]) => fn(r) ?? ''));
    saveTable(format, `breaking_${file}_${data.length}_rows`, title || file, out.map(([h]) => h), data,
      shown.length === rows.length ? '' : `filtered from ${rows.length.toLocaleString()}`);
  }
  bar.addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (act === 'save') { e.stopPropagation(); formatMenu(e.target, download); }
    if (act === 'clear') { Object.keys(filters).forEach((k) => delete filters[k]); sortKey = sort; sortDir = dir; chosen = false; page = 0; draw(); }
  });

  // the heading menu, drawn in the same box the Dataset's headings use
  function openMenu(th) {
    const k = th.dataset.k, already = document.getElementById('colmenu')?.dataset.col === `${file}:${k}`;
    document.getElementById('colmenu')?.remove();
    if (already) return;
    const groups = groupsOf(k), menu = document.createElement('div');
    menu.id = 'colmenu';
    menu.dataset.col = `${file}:${k}`;
    const ticked = (i) => !filters[k] || filters[k].on?.has(i);
    const first = rows.find((r) => !blank(r[k]))?.[k], opts = cols.find((c) => c[0] === k)[2] || {};
    const words = orderWords(opts.group || k === 'to' ? 'date' : typeof first === 'number' ? 'number' : 'text');
    menu.innerHTML = `
      <button data-act="asc" class="${chosen && sortKey === k && sortDir === 1 ? 'on' : ''}">${words[0]}</button>
      <button data-act="desc" class="${chosen && sortKey === k && sortDir === -1 ? 'on' : ''}">${words[1]}</button>
      <button data-act="unsort" class="${chosen && sortKey === k ? '' : 'on'}">Default order</button>
      <hr>
      ${groups ? `<div class="menu-links"><a data-act="all">Select all</a><a data-act="none">Clear</a></div>
        <div class="menu-values">${groups.map((g, i) => `<label><input type="checkbox" value="${i}" ${ticked(i) ? 'checked' : ''}><span>${esc(g.label)}</span><span class="muted">${g.count.toLocaleString()}</span></label>`).join('')}</div>`
        : `<input type="search" data-f="text" placeholder="Contains" autocomplete="off" value="${esc(filters[k]?.text ?? '')}">
           <div class="menu-links"><a data-act="nofilter">Clear this filter</a></div>`}`;
    document.body.append(menu);
    const box = th.getBoundingClientRect();
    menu.style.top = `${box.bottom + scrollY + 4}px`;
    menu.style.left = `${Math.max(8, Math.min(box.left + scrollX, scrollX + innerWidth - menu.offsetWidth - 8))}px`;
    const boxes = () => [...menu.querySelectorAll('input[type=checkbox]')];
    // every group ticked is the same as no filter on this column
    const applyTicks = () => {
      const on = new Set(boxes().filter((b) => b.checked).map((b) => +b.value));
      if (on.size === groups.length) delete filters[k]; else filters[k] = { groups, on };
      page = 0; draw();
    };
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
      const act = e.target.dataset.act;
      if (act === 'all' || act === 'none') { boxes().forEach((b) => { b.checked = act === 'all'; }); applyTicks(); return; }
      if (act === 'asc' || act === 'desc') { sortKey = k; sortDir = act === 'asc' ? 1 : -1; chosen = true; }
      else if (act === 'unsort') { sortKey = sort; sortDir = dir; chosen = false; }
      else if (act === 'nofilter') delete filters[k];
      else return;
      page = 0; draw(); menu.remove();
    });
    menu.addEventListener('change', (e) => { if (e.target.type === 'checkbox') applyTicks(); });
    menu.addEventListener('input', (e) => {
      if (e.target.dataset.f !== 'text') return;
      const text = e.target.value.trim().toLowerCase();
      if (text) filters[k] = { text }; else delete filters[k];
      page = 0; draw();
    });
    menu.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') menu.remove(); });
    menu.querySelector('input[data-f]')?.focus();
  }

  el.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-k]');
    if (th) { e.stopPropagation(); openMenu(th); return; }
    const tr = e.target.closest('tr.row');
    if (!tr || !onRow || e.target.closest('tr.detail') || e.target.closest('a')) return;
    toggle(tr);
  });
  function toggle(tr, keepOpen) {
    const wasOpen = tr.classList.contains('open');
    if (wasOpen && keepOpen) return;
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
  }
  pagerEl?.addEventListener('click', (e) => { if (e.target.dataset.go) { page += +e.target.dataset.go; draw(); } });
  return {
    set(next) { rows = next; page = 0; openKey = null; draw(); },
    // show one row's detail, wherever it is in the current order
    open(k) {
      const tr = [...el.querySelectorAll('tr.row')].find((r) => r.dataset.key === String(k));
      if (tr) toggle(tr, true);
      return Boolean(tr);
    },
  };
}
document.addEventListener('click', (e) => { if (!e.target.closest('#colmenu')) document.getElementById('colmenu')?.remove(); });

const pctCell = (k) => ({ num: true, fmt: (r) => (r[k] === null || r[k] === undefined ? '<span class="muted">-</span>' : `${r[k]}%`) });
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ACTIVE = [['First year', (r) => r.from], ['Last year', (r) => r.to]];
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
    const s = (systems[r[C.system]] ??= { w: 0, l: 0 }), f = (foes[fk] ??= { k: fk, name: NAMES[fk] || foe, w: 0, l: 0 });
    if (won) { s.w++; f.w++; } else if (lost) { s.l++; f.l++; }
  }
  const latest = [...mine].sort((a, c) => String(c[C.date] || c[C.year] || '').localeCompare(String(a[C.date] || a[C.year] || ''))).slice(0, 8);
  const rivals = Object.values(foes).sort((a, c) => c.w + c.l - (a.w + a.l)).slice(0, 6);
  return `${eloChart(b.hist)}
  <div class="cols">
    <div><h4>Record by system</h4><table>${Object.entries(systems).sort((a, c) => c[1].w + c[1].l - a[1].w - a[1].l).map(([s, v]) => `<tr><td><a class="plink" href="#systems">${esc(s)}</a></td><td class="num">${v.w}–${v.l}</td></tr>`).join('')}</table></div>
    <div><h4>Most faced</h4><table>${rivals.map((f) => `<tr><td><a class="plink" data-breaker="${esc(f.k)}">${esc(f.name)}</a></td><td class="num">${f.w}–${f.l}</td></tr>`).join('')}</table></div>
    <div class="wide"><h4>Latest battles</h4><table>${latest.map((r) => {
      const red = r[C.rk] === b.k, me = red ? r[C.red] : r[C.blue], foe = red ? r[C.blue] : r[C.red];
      const res = r[C.winner] === me ? 'Won' : r[C.winner] === foe ? 'Lost' : 'Tie';
      return `<tr><td class="muted" style="white-space:nowrap">${r[C.year] || ''}</td><td class="muted" style="white-space:nowrap">${r[C.md] || ''}</td><td style="white-space:nowrap">${res} vs <a class="plink" data-breaker="${esc(red ? r[C.bk] : r[C.rk])}">${esc(NAMES[red ? r[C.bk] : r[C.rk]] || foe)}</a></td><td class="muted">${esc(r[C.event])}</td></tr>`;
    }).join('')}</table></div>
  </div>
  <p class="key"><a data-find="${esc(b.name)}">All ${mine.length} battles in the dataset</a></p>`;
}

// an event's winners and panel, worked out from the dataset rows already loaded
function eventDetail(ev) {
  if (!DATA) return '<span class="muted">Loading battles…</span>';
  const C = DATA.C, mine = DATA.rows.filter((r) => r[C.event] === ev.name && r[C.system] !== UNCERTAIN);
  const wins = {}, panel = {}, stages = {};
  for (const r of mine) {
    for (const [k, name] of [[r[C.rk], r[C.red]], [r[C.bk], r[C.blue]]]) {
      const w = (wins[k] ??= { k, name: NAMES[k] || name, w: 0, n: 0 });
      w.n++; w.w += r[C.winner] === name;
    }
    for (const n of String(r[C.judge_names] || '').split(', ').filter(Boolean)) panel[n] = (panel[n] || 0) + 1;
    stages[r[C.stage]] = (stages[r[C.stage]] || 0) + 1;
  }
  const top = Object.values(wins).sort((a, c) => c.w - a.w || a.n - c.n).slice(0, 8);
  const judges = Object.entries(panel).sort((a, c) => c[1] - a[1]);
  const link = ev.url ? ` · <a href="${esc(ev.url)}" target="_blank" rel="noopener">Source page</a>` : '';
  return `<div class="cols">
    <div><h4>Most battles won</h4><table>${top.map((w) => `<tr><td><a class="plink" data-breaker="${esc(w.k)}">${esc(w.name)}</a></td><td class="num">${w.w} of ${w.n}</td></tr>`).join('')}</table></div>
    <div><h4>The panel</h4><table>${judges.map(([n, c]) => `<tr><td><a class="plink" data-judge="${esc(n)}">${esc(n)}</a></td><td class="num">${c}</td></tr>`).join('') || '<tr><td class="muted">Not recorded</td></tr>'}</table></div>
    <div><h4>Stages</h4><table>${Object.entries(stages).slice(0, 10).map(([s, n]) => `<tr><td>${esc(s || '(none)')}</td><td class="num">${n}</td></tr>`).join('')}${Object.keys(stages).length > 10 ? `<tr><td class="muted">and ${Object.keys(stages).length - 10} more</td><td></td></tr>` : ''}</table></div>
  </div>
  <p class="key"><a data-find="${esc(ev.name)}">All ${mine.length} battles in the dataset</a>${link}</p>`;
}

function judgeDetail(j) {
  return `<div class="cols"><div><h4>Battles judged by system</h4><table>${j.systems.map(([s, n]) => `<tr><td><a class="plink" href="#systems">${esc(s)}</a></td><td class="num">${n.toLocaleString()}</td></tr>`).join('')}</table></div></div>
  <p class="key"><a data-find="${esc(j.name)}">All battles this judge sat on</a></p>`;
}

// "All battles" links jump to the Dataset tab searched for that name
document.addEventListener('click', (e) => {
  const name = e.target.dataset?.find;
  if (!name || !DATA) return;
  Object.keys(colFilters).forEach((k) => delete colFilters[k]);
  qualityCode = null; sortCol = null; $('#q').value = name; page = 0;
  filter();
  goTab('dataset');
});

const NAMES = {};      // person key -> the spelling used most often

// A name anywhere on the site opens that person. Set once the rankings have loaded.
const OPEN = { breaker: null, judge: null, event: null };
function findInDataset(text) {
  if (!DATA) return;
  Object.keys(colFilters).forEach((k) => delete colFilters[k]);
  qualityCode = null; sortCol = null; $('#q').value = text; page = 0;
  filter();
  goTab('dataset');
}
document.addEventListener('click', (e) => {
  const el = e.target.closest?.('[data-breaker], [data-judge]');
  if (!el) return;
  e.preventDefault();
  if (el.dataset.breaker !== undefined) { if (!OPEN.breaker?.(el.dataset.breaker)) findInDataset(el.textContent); }
  else if (!OPEN.judge?.(el.dataset.judge)) findInDataset(el.dataset.judge);
});

get('data/analytics.json').then((A) => {
  let rank = 0;
  A.breakers.forEach((b) => { NAMES[b.k] = b.name; });
  A.breakers.forEach((b) => { b.rank = b.n >= A.min_battles ? ++rank : null; b.pct = b.w + b.l ? Math.round((100 * b.w) / (b.w + b.l)) : null; });
  const breakers = rankTable($('#breakers-table'), $('#breakers-pager'), [
    ['rank', '#', { num: true, tip: 'Position by Elo rating, once a breaker has 5 battles' }],
    ['name', 'Breaker', { fmt: (r) => `<b>${esc(r.name)}</b>`, tip: 'The name used most often for this breaker' }],
    ['elo', 'Elo', { num: true, fmt: (r) => `<b>${r.elo}</b>`, tip: 'Skill rating today. Everyone starts at 1500; beating stronger breakers raises it more' }],
    ['peak', 'Peak', { num: true, tip: 'The highest Elo rating they have reached' }],
    ['w', 'Won–lost', { num: true, fmt: (r) => `${r.w}–${r.l}`, tip: 'Battles won and battles lost', csv: [['Won', (r) => r.w], ['Lost', (r) => r.l]] }],
    ['pct', 'Win %', { ...pctCell('pct'), tip: 'Share of their battles that they won' }],
    ['vote_share', 'Judge votes %', { ...pctCell('vote_share'), tip: 'Share of all judge votes in their battles that went their way' }],
    ['events', 'Events', { num: true, tip: 'Number of events they have battled at' }],
    ['div', 'Division', { tip: 'The category they most often enter' }],
    ['to', 'Active', { fmt: years, tip: 'First and last year they appear in the dataset', csv: ACTIVE }],
  ], { onRow: breakerDetail, tools: $('#breakers .filters'), file: 'breakers', title: 'Breaker rankings' });
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
  OPEN.breaker = (k) => {
    if (!NAMES[k]) return false;
    $('#bq').value = NAMES[k];
    $('#bdiv .on').classList.remove('on'); $('#bdiv [data-v=""]').classList.add('on');
    showBreakers();
    goTab('breakers');
    return breakers.open(k);
  };

  const judges = rankTable($('#judges-table'), $('#judges-pager'), [
    ['name', 'Judge', { fmt: (r) => `<b>${esc(r.name)}</b>`, tip: 'The name used most often for this judge' }],
    ['battles', 'Battles', { num: true, fmt: (r) => r.battles.toLocaleString(), tip: 'Battles they sat on the panel for' }],
    ['events', 'Events', { num: true, tip: 'Events they have judged at' }],
    ['with', 'With majority', { ...pctCell('with'), tip: 'How often their vote matched most of the panel' }],
    ['alone', 'Lone dissent', { ...pctCell('alone'), tip: 'How often they were the only judge on their side' }],
    ['red', 'Votes for red', { ...pctCell('red'), tip: 'Share of their votes that went to the red side. 50% would be even' }],
    ['to', 'Active', { fmt: years, tip: 'First and last year they appear in the dataset', csv: ACTIVE }],
  ], { onRow: judgeDetail, sort: 'battles', tools: $('#judges [data-view="judges"] .filters'), file: 'judges', title: 'Judges' });
  const showJudges = () => { const q = $('#jq').value.trim().toLowerCase(); judges.set(A.judges.filter((j) => !q || j.name.toLowerCase().includes(q))); };
  $('#jq').oninput = showJudges;
  showJudges();
  OPEN.judge = (name) => {
    const j = A.judges.find((x) => x.k === name) || A.judges.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
    if (!j) return false;
    $('#jq').value = j.name;
    showJudges();
    goTab('judges');
    return judges.open(j.k);
  };
  window.ANALYTICS = A;

  const events = rankTable($('#events-table'), $('#events-pager'), [
    ['name', 'Event', { fmt: (r) => `<b>${esc(r.name)}</b>`, tip: 'The name of the competition' }],
    ['when', 'Year', { num: true, fmt: (r) => r.year || '<span class="muted">-</span>', tip: 'The year the event took place. Sorting by it puts events in date order', csv: [['Year', (r) => r.year]], group: { of: (v) => v.slice(0, 4) } }],
    ['md', 'Month', { fmt: (r) => r.md || '<span class="muted">-</span>', tip: 'Month and day (MM-DD). Older events record only the year', group: { of: (v) => v.slice(0, 2), label: (m) => MONTHS[+m - 1] } }],
    ['field', 'Field', { num: true, tip: 'Average Elo today of the eight highest-rated breakers who entered' }],
    ['battles', 'Battles', { num: true, tip: '1 vs 1 battles recorded at this event' }],
    ['breakers', 'Breakers', { num: true, tip: 'Different breakers who battled' }],
    ['judges', 'Judges', { num: true, tip: 'Different judges on the panel' }],
    ['system', 'System', { fmt: (r) => `<a class="plink" href="#systems">${esc(r.system)}</a>`, tip: 'The judging system used most at this event' }],
    ['unanimous', 'Unanimous', { ...pctCell('unanimous'), tip: 'Rounds where every judge picked the same side' }],
    ['one_vote', 'One-vote', { ...pctCell('one_vote'), tip: 'Rounds decided by a single judge' }],
  ], { onRow: eventDetail, tools: $('#events .filters'), file: 'events', title: 'Events' });
  // Older events have a year and no day. Sorting uses one value for both, so they fall in with their year.
  A.events.forEach((e) => { e.when = e.date || (e.year ? String(e.year) : null); e.md = e.date ? e.date.slice(5) : null; });
  const showEvents = () => {
    const q = $('#eq').value.trim().toLowerCase(), src = $('#esrc .on').dataset.v;
    events.set(A.events.filter((e) => (!src || e.source === src) && (!q || e.name.toLowerCase().includes(q))));
  };
  $('#eq').oninput = showEvents;
  $('#esrc').onclick = (e) => {
    if (!e.target.dataset || e.target.dataset.v === undefined) return;
    $('#esrc .on').classList.remove('on'); e.target.classList.add('on');
    showEvents();
  };
  showEvents();
  OPEN.event = (name) => {
    if (!A.events.some((e) => e.name === name)) return false;
    $('#eq').value = name;
    $('#esrc .on').classList.remove('on'); $('#esrc [data-v=""]').classList.add('on');
    showEvents();
    goTab('events');
    return events.open(name);
  };

  rankTable($('#systems-table'), null, [
    ['system', 'System', { fmt: (r) => `<b>${esc(r.system)}</b>`, tip: 'The judging system' }],
    ['battles', 'Battles', { num: true, fmt: (r) => r.battles.toLocaleString(), tip: 'Battles scored with this system' }],
    ['events', 'Events', { num: true, tip: 'Events that used this system' }],
    ['to', 'Years', { fmt: years, tip: 'First and last year it appears in the dataset', csv: ACTIVE }],
    ['judges', 'Judges', { num: true, tip: 'Average number of judges per battle' }],
    ['rounds', 'Rounds', { num: true, tip: 'Average number of rounds per battle' }],
    ['unanimous', 'Unanimous', { ...pctCell('unanimous'), tip: 'Rounds where every judge picked the same side' }],
    ['one_vote', 'One-vote', { ...pctCell('one_vote'), tip: 'Rounds decided by a single judge' }],
    ['red_wins', 'Red wins', { ...pctCell('red_wins'), tip: 'Share of decided battles won by the red side' }],
    ['ties', 'Ties', { num: true, tip: 'Battles that ended level' }],
  ], { sort: 'battles', tools: $('#systems-tools'), file: 'systems', title: 'Judging systems' }).set(A.systems.map((s) => ({ ...s, k: s.system })));
});
