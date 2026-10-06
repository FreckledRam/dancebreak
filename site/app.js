const $ = (s) => document.querySelector(s);
const PAGE = 50;
const SOURCE_NAMES = { seed: 'Original', and8: 'And8', wdsf: 'WDSF', breakkonnect: 'Break Konnect' };
const SYSTEMS = ['Traditional', 'RoundByRound', 'SingleSlider', 'Threefold', 'PseudoThreefold', 'Trivium', 'WDSFSystem', 'PointsPerRound'];

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const get = (path) => fetch(path, { cache: 'no-cache' }).then((r) => r.json());

function ago(iso) {
  if (!iso) return '<span class="muted">Never</span>';
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  const text = mins < 1 ? 'Just now' : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`;
  return `<span title="${esc(new Date(iso).toLocaleString())}">${text}</span>`;
}

// ---- tabs
const TABS = ['sources', 'dataset', 'breakers', 'judges', 'events', 'news', 'home'];
const VIEW_OF = { systems: 'judges', review: 'sources' };
function showTab() {
  // Systems and Null are views inside the Judges and Data health tabs, each with its own address
  const hash = location.hash.slice(1);
  const tab = VIEW_OF[hash] || (TABS.includes(hash) ? hash : 'home'), view = VIEW_OF[hash] ? hash : tab;
  document.body.dataset.tab = tab;
  document.querySelectorAll(`#${tab} .view`).forEach((v) => { v.hidden = v.dataset.view !== view; });
  document.querySelectorAll(`#${tab} .twin a`).forEach((a) => a.classList.toggle('on', a.dataset.view === view));
  document.querySelectorAll('main section').forEach((s) => { s.hidden = s.id !== tab; });
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.hash === '#' + tab));
  window.closeNavMenus?.();
  moveGlass();
  // the tab bar must not move under the pointer: stay where we are, unless we are further down than the new tab's top
  if (scrollY > stickPoint()) scrollTo(0, stickPoint());
}

const NARROW = matchMedia('(max-width: 900px)');

// the header is sticky and slides up until only the tab bar is left; this is the scroll position where that happens
function stickPoint() {
  if (NARROW.matches) return 0;       // on a phone the tabs are behind the menu button and the whole header stays
  return Math.max(0, $('nav').offsetTop - 8);
}

// the glass behind the lit tab. Its leading edge is given the shorter transition, so it stretches on the way.
function moveGlass() {
  slideGlass($('nav'), $('nav .tab.on'));
  document.querySelectorAll('main section:not([hidden]) .twin').forEach((t) => slideGlass(t, t.querySelector('a.on')));
}
function slideGlass(box, on) {
  const glass = box.querySelector('.nav-glass');
  const n = box.getBoundingClientRect(), a = on?.getBoundingClientRect();
  if (!on || !a.width) return;
  const left = a.left - n.left;
  glass.classList.toggle('to-right', left > parseFloat(glass.style.getPropertyValue('--l') || 0));
  glass.classList.toggle('to-left', left < parseFloat(glass.style.getPropertyValue('--l') || 0));
  glass.style.setProperty('--l', `${left}px`);
  glass.style.setProperty('--r', `${n.right - a.right}px`);
  glass.style.setProperty('--t', `${a.top - n.top}px`);
  glass.style.setProperty('--h', `${a.height}px`);
  glass.style.setProperty('--tint', getComputedStyle(on).color);
}

// Changing tab by setting the address would make the browser jump to the section of that name first.
// So tabs are changed here, and the address is updated without that jump.
function goTab(tab) {
  if (location.hash.slice(1) === tab || (!location.hash && tab === 'home')) { scrollTo({ top: Math.min(scrollY, stickPoint()), behavior: 'smooth' }); return; }
  history.pushState(null, '', '#' + tab);
  dispatchEvent(new HashChangeEvent('hashchange'));
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || !(TABS.includes(a.hash.slice(1)) || VIEW_OF[a.hash.slice(1)])) return;
  e.preventDefault();
  goTab(a.hash.slice(1));
});
// a refresh starts at the top of the page, not wherever the browser remembers being
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
addEventListener('hashchange', showTab);
showTab();
function settleHeader() {
  $('header').style.top = `-${stickPoint()}px`;
  moveGlass();
}
settleHeader();
requestAnimationFrame(() => document.querySelectorAll('.nav-glass').forEach((g) => g.classList.add('live')));
addEventListener('resize', settleHeader);
document.fonts?.ready.then(settleHeader);
// a tab label can change width after the data loads (the status dot, the Null count)
const navWatch = new ResizeObserver(settleHeader);
document.querySelectorAll('nav .tab').forEach((a) => navWatch.observe(a));
addEventListener('load', () => { scrollTo(0, 0); settleHeader(); });

// ---- news: upcoming events and headlines. Pictures load from the site that owns them, at thumbnail size.
const NEWS_SOURCES = { and8: 'And8', wdsf: 'WDSF', breakkonnect: 'Break Konnect' };
const NEWS_PAGE = 20;
const day = (iso) => new Date(iso + 'T12:00:00');
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); };
const daysTo = (iso) => Math.round((day(iso) - today()) / 864e5);

function dateRange(ev) {
  const a = day(ev.start), b = day(ev.end), md = { month: 'short', day: 'numeric' };
  if (ev.start === ev.end) return a.toLocaleDateString([], md);
  return a.getMonth() === b.getMonth() ? `${a.toLocaleDateString([], md)}-${b.getDate()}` : `${a.toLocaleDateString([], md)} - ${b.toLocaleDateString([], md)}`;
}

function until(ev) {
  const n = daysTo(ev.start);
  return n <= 0 ? 'On now' : n === 1 ? 'Tomorrow' : n < 14 ? `In ${n} days` : n < 60 ? `In ${Math.round(n / 7)} weeks` : `In ${Math.round(n / 30)} months`;
}

// a picture that fails to load takes its frame with it
const picture = (src, cls) => (src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '');

let NEWS_SHOWN = NEWS_PAGE;
function renderNews(news) {
  const events = ((news && news.upcoming) || []).filter((e) => daysTo(e.end) >= 0);
  const features = (news && news.features) || [], headlines = (news && news.headlines) || [];
  if (!events.length && !features.length && !headlines.length) {
    $('#news-nums').innerHTML = '<span class="muted">Nothing collected yet.</span>';
    return;
  }

  // the event to lead with: the soonest one that has a picture within two weeks, else the soonest
  const lead = events.find((e) => e.image && daysTo(e.start) <= 14) || events[0];
  const next = $('#news-next');
  next.hidden = !lead;
  if (lead) {
    next.href = lead.url;
    next.classList.toggle('plain', !lead.image);
    next.innerHTML = `${picture(lead.image, 'poster')}<div><h2>Next up</h2><h1>${esc(lead.name)}</h1>
      <p class="sub">${dateRange(lead)}${lead.place ? ` · ${esc(lead.place)}` : ''}</p>
      <p class="when">${until(lead)}</p></div>`;
  }

  const within = (n) => events.filter((e) => daysTo(e.start) <= n).length;
  const countries = new Set(events.map((e) => e.place.split(', ').pop()).filter(Boolean));
  $('#news-nums').innerHTML = [
    ['hero', within(7), 'this week'], ['', within(30), 'next 30 days'], ['', events.length, 'on the calendar'], ['', countries.size, 'countries'],
  ].map(([cls, b, label]) => `<div class="${cls}"><b>${b}</b><span>${label}</span></div>`).join('');
  $('#news-updated').innerHTML = news.updated ? `Updated ${ago(news.updated)}` : '';

  let month = '';
  $('#news-events').innerHTML = events.slice(0, NEWS_SHOWN).map((e) => {
    const m = day(e.start).toLocaleDateString([], { month: 'long', year: 'numeric' });
    const head = m === month ? '' : `<h3>${m}</h3>`;
    month = m;
    return `${head}<a class="event" href="${esc(e.url)}" target="_blank" rel="noopener">
      <time>${dateRange(e)}</time>
      <span><b>${esc(e.name)}</b><small>${esc([e.place, NEWS_SOURCES[e.source]].filter(Boolean).join(' · '))}</small></span>
      ${picture(e.image, 'thumb')}</a>`;
  }).join('') || '<span class="muted">No upcoming events listed.</span>';
  const more = $('#news-more');
  more.hidden = events.length <= NEWS_SHOWN;
  more.textContent = `Show all ${events.length}`;
  more.onclick = () => { NEWS_SHOWN = Infinity; renderNews(news); };

  const stamp = (a) => `${esc(a.source)} · ${day(a.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  $('#news-features').innerHTML = features.slice(0, 3).map((a, i) => `<a class="story${i ? '' : ' lead'}" href="${esc(a.url)}" target="_blank" rel="noopener">
    ${picture(a.image, 'shot')}<span><b>${esc(a.title)}</b><small>${stamp(a)}</small></span></a>`).join('');
  $('#news-headlines').innerHTML = [...features.slice(3), ...headlines].sort((a, b) => b.date.localeCompare(a.date))
    .map((a) => `<a class="line" href="${esc(a.url)}" target="_blank" rel="noopener"><b>${esc(a.title)}</b><small>${stamp(a)}</small></a>`).join('');
}

// ---- source status
function span(hours) {
  return hours < 48 ? `${hours} hours` : `${Math.round(hours / 24)} days`;
}

function countdown(to) {
  const mins = Math.max(0, Math.round((to - Date.now()) / 60000));
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

// runs start at the same minute of every Nth hour, UTC
function nextRun(status) {
  const now = new Date();
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), status.run_hour || 0, status.run_minute));
  while (t <= now) t.setUTCHours(t.getUTCHours() + status.hours_between_runs);
  return t;
}

function progressCell(key, q, done, pct) {
  const live = liveProgress(key);
  if (live) return `<div class="progress"><div class="bar live"><i style="width:${live.pct}%"></i></div><span class="note">${live.done}/${live.todo} events</span></div>`;
  if (!q.waiting) return '<span class="muted">Up to date</span>';
  return `<div class="progress"><div class="bar"><i style="width:${pct}%"></i></div><span class="note">${done.toLocaleString()}/${q.seen.toLocaleString()} events</span></div>`;
}

// Healthy: last run worked. Error: it could not read the site. Not running: no recent run at all.
function health(s, status) {
  const stale = !s.last_checked || Date.now() - new Date(s.last_checked) > 2.5 * status.hours_between_runs * 3600e3;
  // yellow: it ran but hit a problem. red: it is not running at all.
  if (stale || (s.status !== 'ok' && s.status !== 'broken')) return ['stopped', 'Not running'];
  return s.status === 'broken' ? ['error', 'Error'] : ['ok', 'Healthy'];
}

let STATUS = null, ACTIVITY = [], LIVE = null;

// During a run the pipeline pushes data/progress.json to the repository. Read it from there so the
// page can show a run in progress without the site being rebuilt or the page reloaded.
async function pollProgress() {
  const repo = new URL($('#repo').href).pathname.slice(1);
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${repo}/main/data/progress.json?t=${Date.now()}`, { cache: 'no-store' });
    const p = r.ok ? await r.json() : null;
    const fresh = p && Date.now() - new Date(p.updated) < 3 * 3600e3;     // ignore a marker left by a dead run
    LIVE = p && p.running && fresh ? p : null;
  } catch (e) { LIVE = null; }
  if (STATUS) renderStatus(STATUS, ACTIVITY);
}

// Estimated, not measured: time since the source started against its expected duration.
function liveProgress(key) {
  const src = LIVE && LIVE.sources[key];
  if (!src || LIVE.current !== key) return null;
  const elapsed = (Date.now() - new Date(src.started)) / 1000;
  const pct = Math.min(95, Math.max(3, Math.round((100 * elapsed) / Math.max(src.eta_seconds, 60))));
  const left = Math.max(1, Math.round((src.eta_seconds - elapsed) / 60));
  return { pct, left, todo: src.todo, done: Math.min(src.todo, Math.max(src.done || 0, Math.floor((src.todo * pct) / 100))) };
}

function renderStatus(status, activity) {
  STATUS = status; ACTIVITY = activity;
  const runsFor = (n) => Math.ceil(n / status.events_per_run);
  const queue = status.queue || {};
  const backlog = Object.values(queue).reduce((sum, q) => sum + q.waiting, 0);
  const runs = Math.max(0, ...Object.values(queue).map((q) => runsFor(q.waiting)));
  const next = nextRun(status);

  const added = status.last_run_added || { events: 0, battles: 0 };
  const states = Object.entries(status.sources).map(([key, src]) => (LIVE && LIVE.current === key ? 'running' : health(src, status)[0]));
  const broken = states.filter((x) => x === 'error').length, idle = states.filter((x) => x === 'stopped').length;
  $('#headline').textContent = LIVE ? 'Check in progress'
    : idle ? `${idle} scraper${idle === 1 ? ' is' : 's are'} not running`
      : broken ? `${broken} scraper${broken === 1 ? ' has' : 's have'} an error` : 'All scrapers healthy';
  // the dot beside the tab: green and pulsing when every scraper is healthy
  const dot = $('#nav-dot');
  dot.className = `status ${LIVE ? 'running' : idle ? 'stopped' : broken ? 'error' : 'ok'}`;
  dot.title = $('#headline').textContent;
  dot.hidden = false;
  // the same state as a word, beside Scraper health in that page's title
  const word = $('#health-word');
  word.textContent = LIVE ? 'Running' : idle ? 'Not running' : broken ? 'Error' : 'Healthy';
  word.className = dot.className.replace('status ', '');
  $('#headline').closest('.panel').classList.toggle('healthy', !LIVE && !idle && !broken);
  const news = added.events || added.battles
    ? `<span class="good">+${added.events.toLocaleString()} event${added.events === 1 ? '' : 's'}, +${added.battles.toLocaleString()} battle${added.battles === 1 ? '' : 's'}.</span>`
    : '<span class="good">No new events or battles.</span>';
  // the soonest "Last new data" in the table below
  const latest = Object.values(status.sources).map((x) => x.last_changed).filter(Boolean).sort().pop();
  $('#last-run').innerHTML = LIVE ? '' : `Last run ${ago(status.last_run)}`;
  $('#headline-sub').innerHTML = LIVE ? `Started ${ago(LIVE.started)}. Totals update when it finishes.`
    : `Most recent data ${ago(latest)}. ${news} Next scrape in <b class="next" title="${esc(next.toLocaleString())}">${countdown(next)}</b>.`;
  document.querySelectorAll('.review-count').forEach((el) => { el.textContent = status.need_review || ''; });
  const T = status.totals || {};
  const plus = (n, what) => (n ? `<small class="up">+${n.toLocaleString()} this week</small>` : `<small>None new this week</small>`);
  const newest = T.newest_date ? new Date(T.newest_date + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
  $('#totals').innerHTML = [
    ['hero', status.battles.toLocaleString(), 'battles', plus(T.week_battles, 'battles')],
    ['', status.events.toLocaleString(), 'events', plus(T.week_events, 'events')],
    ['', (T.decisions || 0).toLocaleString(), 'judge decisions', '<small>one judge, one round</small>'],
    ['', (T.breakers || 0).toLocaleString(), 'breakers', '<small>&nbsp;</small>'],
    ['', (T.judges || 0).toLocaleString(), 'judges', '<small>&nbsp;</small>'],
    ['date', newest, 'newest event', `<small>${T.first_year ? `records from ${T.first_year}` : '&nbsp;'}</small>`],
  ].map(([cls, b, label, extra]) => `<div class="${cls}"><b>${b}</b><span>${label}</span>${extra}</div>`).join('');

  $('#sources-table tbody').innerHTML = Object.entries(status.sources).map(([key, s]) => {
    const [cls, label] = LIVE && LIVE.current === key ? ['running', 'Running'] : health(s, status);
    const quiet = s.last_checked ? Math.round((Date.now() - new Date(s.last_checked)) / 3600e3) : null;
    const why = cls === 'stopped'
      ? (quiet === null ? 'This scraper has never run.' : `No scrape in the last ${quiet < 48 ? `${quiet} hours` : `${Math.round(quiet / 24)} days`}. The schedule may have stopped.`)
      : cls === 'error' ? s.note : '';
    return `<tr>
    <td><b><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a></b></td>
    <td data-label="Status"><div><span class="status ${cls}">${label}</span>${why ? `<div class="note" ${s.detail ? `title="${esc(s.detail)}"` : ''}>${esc(why)}</div>` : ''}</div></td>
    <td data-label="Last new data">${ago(s.last_changed)}</td>
    <td data-label="Newest event">${s.newest_event ? `<div class="clip"><span title="${esc(s.newest_event)}">${esc(s.newest_event)}</span><small>${esc(s.newest_date || '')}</small></div>` : '<span class="muted">-</span>'}</td>
    <td data-label="Battles" class="num">${(status.battles_by_source[key] || 0).toLocaleString()}</td>
  </tr>`;
  }).join('');

  const showQueue = Boolean(LIVE) || backlog > 0;
  $('#queue-table').hidden = !showQueue;
  $('#queue-note').textContent = LIVE ? 'A check is running now. Progress is an estimate.'
    : backlog ? `Each run takes up to ${status.events_per_run} events per scraper, newest first.`
      : 'Nothing waiting. All scrapers are up to date.';
  $('#queue-table tbody').innerHTML = Object.entries(status.sources).map(([key, s]) => {
    const q = queue[key] || { waiting: 0, seen: 0, next: [] };
    const n = runsFor(q.waiting);
    const live = liveProgress(key);
    const done = q.seen - q.waiting;
    const pct = q.seen ? Math.round((100 * done) / q.seen) : 0;
    const [state] = live ? ['running'] : health(s, status);
    // how long until this scraper's own queue is empty
    const cleared = live ? `About ${live.left} min`
      : !q.waiting ? '<span class="muted">Up to date</span>'
        : state === 'stopped' ? '<span class="muted">Not until it runs again</span>'
          : state === 'error' ? '<span class="muted">Not until the error is fixed</span>'
            : `About ${span(n * status.hours_between_runs)}`;
    // scraping: being worked on right now. queued: has events waiting for a run.
    const stage = live ? 'scraping' : q.waiting ? 'queued' : 'idle';
    const stageLabel = { scraping: '<span class="scraping">Scraping</span>', queued: 'Queued', idle: '<span class="muted">-</span>' }[stage];
    return `<tr class="${stage}">
    <td>${esc(s.name)}</td>
    <td data-label="Status">${stageLabel}</td>
    <td data-label="Progress">${progressCell(key, q, done, pct)}</td>
    <td data-label="Time left">${cleared}</td>
  </tr>`;
  }).join('');


  $('#runs-table tbody').innerHTML = (status.runs || []).map((r) => `<tr>
    <td style="white-space:nowrap">${esc(new Date(r.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}</td>
    <td><span class="status ${r.ok ? 'ok' : 'error'}">${r.ok ? 'OK' : 'Error'}</span>${r.note ? `<small>${esc(r.note)}</small>` : ''}</td>
    <td class="num">${r.events.toLocaleString()}</td><td class="num">${r.battles.toLocaleString()}</td>
  </tr>`).join('') || '<tr><td colspan="4" class="muted">No runs yet.</td></tr>';

  renderQuality(status);
  renderAdded(status);
}

// Dataset tab: how much the most recent additions grew the dataset, and since when.
// Counts back from the newest run to the last one that added battles; "since" is the run before that.
function renderAdded(status) {
  const runs = status.runs || [];
  const last = runs.findIndex((r) => r.battles > 0);
  const since = last >= 0 && runs[last + 1];
  $('#dataset-added').hidden = !since;
  if (!since) return;
  const added = runs.slice(0, last + 1).reduce((sum, r) => sum + r.battles, 0);
  const when = new Date(since.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  $('#dataset-added').textContent = `+${added.toLocaleString()} since ${when}`;
}

// ---- dataset
let DATA = null, rows = [], page = 0, sortCol = null, sortDir = 1, qualityCode = null;   // qualityCode: a Review check to show
const eventCache = {};

const colFilters = {};          // column -> Set of values to keep (absent = no filter on that column)
const label = (col, v) => (col === 'source' ? SOURCE_NAMES[v] || v : v === '' || v == null ? '(blank)' : String(v));

function setupDataset(data) {
  DATA = data;
  const C = Object.fromEntries(data.cols.map((c, i) => [c, i]));
  DATA.C = C;
  DATA.text = data.rows.map((r) => [r[C.event], r[C.stage], r[C.red], r[C.blue], r[C.judge_names]].join(' ').toLowerCase());
  $('#downloads').innerHTML = SYSTEMS.map((s) => `<a href="data/export/${s}DataRaw.tsv" download>${s}</a>`).join(', ');
  $('#q').addEventListener('input', () => { page = 0; filter(); });
  $('#clear-filters').onclick = () => {
    Object.keys(colFilters).forEach((k) => delete colFilters[k]);
    sortCol = null; qualityCode = null; $('#q').value = ''; page = 0; filter();
  };
  document.querySelectorAll('#battles th[data-sort]').forEach((th) => {
    th.onclick = (e) => { e.stopPropagation(); openColumnMenu(th); };
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#colmenu')) closeColumnMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeColumnMenu(); });
  $('#prev').onclick = () => { page--; draw(); };
  $('#next').onclick = () => { page++; draw(); };
  filter();
}

// Battles whose judging system is not confirmed are held out of the dataset. They show only when
// asked for: by ticking "Uncertain" in the System column menu, or from the Null tab.
const UNCERTAIN = 'Uncertain';
const wantsUncertain = () => Boolean(qualityCode) || Boolean(colFilters.system && colFilters.system.has(UNCERTAIN));

function passes(r, i, words, skipCol) {
  const C = DATA.C;
  if (qualityCode && !r[C.q].includes(qualityCode)) return false;
  if (r[C.system] === UNCERTAIN && skipCol !== 'system' && !wantsUncertain()) return false;
  for (const col in colFilters) {
    if (col !== skipCol && !colFilters[col].has(String(r[C[col]] ?? ''))) return false;
  }
  return !words.length || words.every((w) => DATA.text[i].includes(w));
}

function filter() {
  const C = DATA.C;
  const words = $('#q').value.toLowerCase().split(/\s+/).filter(Boolean);
  rows = DATA.rows.filter((r, i) => passes(r, i, words));
  if (sortCol) {
    // Year sorts by full date where the event has one
    const key = sortCol === 'year' ? (r) => r[C.date] || (r[C.year] ? String(r[C.year]) : '') : (r) => r[C[sortCol]] ?? '';
    const numeric = sortCol === 'judges';
    rows.sort((x, y) => sortDir * (numeric ? key(x) - key(y) : String(key(x)).localeCompare(String(key(y)), undefined, { sensitivity: 'base' })));
  }
  document.querySelectorAll('#battles th[data-sort]').forEach((th) => {
    const col = th.dataset.sort;
    th.dataset.dir = col === sortCol ? (sortDir === 1 ? 'asc' : 'desc') : '';
    th.classList.toggle('filtered', col in colFilters);
  });
  const active = Object.keys(colFilters).length || sortCol || words.length || qualityCode;
  const check = qualityCode && STATUS && (STATUS.quality || []).find((x) => x.code === qualityCode);
  $('#quality-note').textContent = check ? ` · Showing: ${check.label}` : '';
  $('#clear-filters').hidden = !active;
  draw();
}

// ---- download the battles currently shown, with every score column, as one CSV
const COLUMN_NAMES = { year: 'Date', event: 'Event', stage: 'Stage', red: 'Red', blue: 'Blue', system: 'System', source: 'Source' };

function activeFilters() {
  const out = [];
  const q = $('#q').value.trim();
  if (q) out.push(['Search', q]);
  for (const col in colFilters) {
    const values = [...colFilters[col]].map((v) => label(col, v));
    out.push([COLUMN_NAMES[col] || col, values.length > 6 ? `${values.slice(0, 6).join(', ')} and ${values.length - 6} more` : values.join(', ') || 'none selected']);
  }
  const check = qualityCode && STATUS && (STATUS.quality || []).find((x) => x.code === qualityCode);
  if (check) out.push(['Null check', check.label]);
  if (sortCol) out.push(['Sorted by', `${COLUMN_NAMES[sortCol] || sortCol}, ${sortDir === 1 ? 'ascending' : 'descending'}`]);
  return out;
}

function openDownload() {
  const filters = activeFilters(), systems = new Set(rows.map((r) => r[DATA.C.system]));
  $('#modal-title').textContent = `Download ${rows.length.toLocaleString()} row${rows.length === 1 ? '' : 's'}`;
  $('#modal-body').innerHTML = `
    <p>One row per battle, with every judge's scores.</p>
    <h4>Filters applied</h4>
    ${filters.length ? `<table>${filters.map(([k, v]) => `<tr><td class="muted">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`
      : '<p class="muted">None. This is the whole dataset.</p>'}
    ${systems.size > 1 ? `<p class="note">These battles use ${systems.size} judging systems. Each has its own score columns, so columns a battle does not use are left blank.</p>` : ''}`;
  $('#modal-ok').disabled = !rows.length;
  $('#modal-ok').textContent = 'Download';
  $('#modal').hidden = false;
}

const csvCell = (v) => { const t = String(v ?? ''); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const scoreKey = (k) => { const m = k.match(/^(tie)?(?:r(\d+))?j(\d+)/); return m ? [m[1] ? 99 : +(m[2] || 0), +m[3]] : null; };

async function downloadCsv() {
  const C = DATA.C, picked = rows.slice();
  $('#modal-ok').disabled = true;
  const files = [...new Set(picked.map((r) => DATA.files[r[C.file]]))];
  for (let i = 0; i < files.length; i += 8) {       // a few files at a time
    $('#modal-ok').textContent = `Preparing ${Math.round((100 * i) / files.length)}%`;
    await Promise.all(files.slice(i, i + 8).map(async (f) => { eventCache[f] ??= await get('data/events/' + f); }));
  }
  const battles = picked.map((r) => eventCache[DATA.files[r[C.file]]].battles[r[C.idx]]);
  // columns: details first in the order they appear, then score columns by round and judge
  const meta = [], scores = [], seen = new Set();
  for (const b of battles) for (const k of Object.keys(b.cells)) { if (!seen.has(k)) { seen.add(k); (scoreKey(k) ? scores : meta).push(k); } }
  const position = Object.fromEntries(scores.map((k, i) => [k, i]));
  scores.sort((a, b) => { const x = scoreKey(a), y = scoreKey(b); return x[0] - y[0] || x[1] - y[1] || position[a] - position[b]; });
  const header = ['date', 'system', ...meta, ...scores, 'source', 'source url'];
  const lines = [header.map(csvCell).join(',')];
  picked.forEach((r, i) => {
    const cells = battles[i].cells;
    lines.push([r[C.date] || r[C.year] || '', r[C.system], ...meta.map((k) => cells[k]), ...scores.map((k) => cells[k]),
      SOURCE_NAMES[r[C.source]] || r[C.source], r[C.url] || ''].map(csvCell).join(','));
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' }));
  link.download = `breaking_battles_${picked.length}_rows.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  $('#modal').hidden = true;
}

$('#download-csv').onclick = () => DATA && openDownload();
$('#modal-ok').onclick = downloadCsv;
$('#modal-cancel').onclick = () => { $('#modal').hidden = true; };
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('#modal').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#modal').hidden = true; });

// ---- column menu: sort and pick values, like a spreadsheet header
const MENU_LIMIT = 200;

function closeColumnMenu() { $('#colmenu')?.remove(); }

function openColumnMenu(th) {
  const already = $('#colmenu')?.dataset.col === th.dataset.sort;
  closeColumnMenu();
  if (already) return;
  const col = th.dataset.sort, C = DATA.C;
  const words = $('#q').value.toLowerCase().split(/\s+/).filter(Boolean);
  // values still reachable given the other columns' filters, with how many battles each has
  const counts = new Map();
  DATA.rows.forEach((r, i) => {
    if (!passes(r, i, words, col)) return;
    const v = String(r[C[col]] ?? '');
    counts.set(v, (counts.get(v) || 0) + 1);
  });
  const numeric = col === 'year' || col === 'judges';
  const values = [...counts.keys()].sort((a, b) => (numeric ? b - a : a.localeCompare(b, undefined, { sensitivity: 'base' })));

  const menu = document.createElement('div');
  menu.id = 'colmenu';
  menu.dataset.col = col;
  menu.innerHTML = `
    <button data-act="asc" class="${sortCol === col && sortDir === 1 ? 'on' : ''}">Sort ascending</button>
    <button data-act="desc" class="${sortCol === col && sortDir === -1 ? 'on' : ''}">Sort descending</button>
    <button data-act="unsort" class="${sortCol === col ? '' : 'on'}">Default order</button>
    <hr>
    <input type="search" placeholder="Find a value" autocomplete="off">
    <div class="menu-links"><a data-act="all">Select all</a><a data-act="none">Clear</a></div>
    <div class="menu-values"></div>
    <p class="note"></p>`;
  document.body.append(menu);
  const box = th.getBoundingClientRect();
  menu.style.top = `${box.bottom + scrollY + 4}px`;
  menu.style.left = `${Math.max(8, Math.min(box.left + scrollX, scrollX + innerWidth - menu.offsetWidth - 8))}px`;

  const search = menu.querySelector('input[type=search]');
  const shown = () => values.filter((v) => label(col, v).toLowerCase().includes(search.value.toLowerCase()));
  // with no filter set, everything is ticked except Uncertain
  const byDefault = () => new Set(values.filter((v) => !(col === 'system' && v === UNCERTAIN)));
  const picked = () => colFilters[col] || byDefault();

  function list() {
    const hits = shown(), sel = picked();
    menu.querySelector('.menu-values').innerHTML = hits.slice(0, MENU_LIMIT).map((v) => `<label>
      <input type="checkbox" value="${esc(v)}" ${sel.has(v) ? 'checked' : ''}>
      <span>${esc(label(col, v))}</span><span class="muted">${counts.get(v).toLocaleString()}</span></label>`).join('');
    menu.querySelector('p.note').textContent = hits.length > MENU_LIMIT
      ? `Showing ${MENU_LIMIT} of ${hits.length.toLocaleString()}. Type to narrow.` : '';
  }
  function apply(set) {
    const d = byDefault();
    if (set.size === d.size && [...d].every((v) => set.has(v))) delete colFilters[col]; else colFilters[col] = set;
    page = 0; filter(); list();
  }
  search.oninput = list;
  menu.onclick = (e) => {
    e.stopPropagation();
    const act = e.target.dataset.act;
    if (act === 'asc' || act === 'desc') { sortCol = col; sortDir = act === 'asc' ? 1 : -1; page = 0; filter(); closeColumnMenu(); }
    if (act === 'unsort') { if (sortCol === col) sortCol = null; page = 0; filter(); closeColumnMenu(); }
    // with a search typed, Select all / Clear act on the matching values only
    if (act === 'all') { const s = search.value ? new Set(picked()) : new Set(values); shown().forEach((v) => s.add(v)); apply(s); }
    if (act === 'none') { const s = search.value ? new Set(picked()) : new Set(); if (search.value) shown().forEach((v) => s.delete(v)); apply(s); }
  };
  menu.onchange = (e) => {
    if (e.target.type !== 'checkbox') return;
    const s = new Set(picked());
    e.target.checked ? s.add(e.target.value) : s.delete(e.target.value);
    apply(s);
  };
  list();
  search.focus();
}

function draw() {
  const C = DATA.C;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  page = Math.min(Math.max(page, 0), pages - 1);
  const confirmed = DATA.rows.reduce((n, r) => n + (r[C.system] !== UNCERTAIN), 0);
  const held = DATA.rows.length - confirmed;
  const filtered = rows.length !== confirmed || wantsUncertain();
  $('#dataset-title').textContent = filtered
    ? `${rows.length.toLocaleString()} of ${confirmed.toLocaleString()} battles` : `${confirmed.toLocaleString()} battles`;
  const plain = rows.length === confirmed && !wantsUncertain();
  $('#count').textContent = plain
    ? `All battles${held ? `, plus ${held.toLocaleString()} held out as system uncertain` : ''}`
    : `${rows.length.toLocaleString()} match`;
  $('#page').textContent = `Page ${page + 1} of ${pages}`;
  $('#prev').disabled = page === 0;
  $('#next').disabled = page >= pages - 1;
  const name = (r, side) => `<td class="side ${r[C.winner] && r[C.winner] === r[C[side]] ? 'win' : ''}"><i class="tick ${side}"></i>${esc(r[C[side]])}</td>`;
  $('#battles tbody').innerHTML = rows.slice(page * PAGE, (page + 1) * PAGE).map((r) => `<tr class="row" data-f="${r[C.file]}" data-i="${r[C.idx]}" data-rk="${esc(r[C.rk])}" data-bk="${esc(r[C.bk])}">
    <td style="white-space:nowrap">${r[C.date] || r[C.year] || ''}</td><td>${esc(r[C.event])}</td><td>${esc(r[C.stage])}</td>
    ${name(r, 'red')}${name(r, 'blue')}
    <td>${r[C.system] === UNCERTAIN ? '<span class="muted">Uncertain</span>' : `<a class="plink" href="#systems" title="How this system behaves">${esc(r[C.system])}</a>`}</td>
    <td>${r[C.url] ? `<a href="${esc(r[C.url])}" target="_blank" rel="noopener">${esc(SOURCE_NAMES[r[C.source]] || r[C.source])}</a>` : `<span class="muted">${esc(SOURCE_NAMES[r[C.source]] || r[C.source])}</span>`}</td>
  </tr>`).join('') || '<tr><td colspan="7" class="muted">No battles match.</td></tr>';
}

$('#battles tbody').addEventListener('click', async (e) => {
  if (e.target.dataset.act === 'raw') { e.target.closest('td').querySelector('.raw').hidden ^= true; return; }
  if (e.target.closest('a') || e.target.closest('tr.detail')) return;
  const tr = e.target.closest('tr.row');
  if (!tr) return;
  if (tr.nextElementSibling?.classList.contains('detail')) { tr.nextElementSibling.remove(); tr.classList.remove('open'); return; }
  const file = DATA.files[tr.dataset.f];
  eventCache[file] ??= await get('data/events/' + file);
  // only one battle open at a time
  document.querySelectorAll('#battles tr.detail').forEach((d) => d.remove());
  document.querySelectorAll('#battles tr.open').forEach((r) => r.classList.remove('open'));
  const detail = document.createElement('tr');
  detail.className = 'detail';
  detail.innerHTML = `<td colspan="7">${battleDetail(eventCache[file].battles[tr.dataset.i], tr.dataset)}</td>`;
  tr.classList.add('open');
  tr.after(detail);
});

// every score cell of a battle, grouped round -> judge seat -> category
function scoreCells(b) {
  const rounds = {};
  for (const [key, value] of Object.entries(b.cells)) {
    const m = key.match(/^(tie)?(?:r(\d+))?j(\d+)([a-z0-9]+)$/);
    if (!m) continue;
    const r = m[1] ? 'tie' : m[2] || '0';
    ((rounds[r] ??= {})[m[3]] ??= {})[m[4]] = value;
  }
  return rounds;
}
const roundName = (r) => (r === '0' ? 'Votes' : r === 'tie' ? 'Tiebreaker' : 'Round ' + r);
const roundOrder = (rounds) => Object.keys(rounds).sort((a, c) => (a === 'tie') - (c === 'tie') || a - c);

// Each judge's overall call per round as a bar: left of centre for red, right for blue.
// Scored systems use the size of the margin; vote-only systems get a full-length bar.
function battleDetail(b, keys = {}) {
  const judge = (j) => { const n = b.judges[j - 1]; return n ? `<a class="plink" data-judge="${esc(n)}" title="Open this judge">${esc(n)}</a>` : 'Judge ' + j; };
  const breaker = (name, k) => (k ? `<a class="plink" data-breaker="${esc(k)}" title="Open this breaker">${esc(name)}</a>` : esc(name));
  const rounds = scoreCells(b), order = roundOrder(rounds);
  if (!order.length) return '<span class="muted">No judge-level scores recorded.</span>';
  const overall = (cell) => cell.over ?? cell.vote;
  const numbers = order.flatMap((r) => Object.values(rounds[r]).map(overall)).filter((v) => v !== undefined && !isNaN(v)).map((v) => Math.abs(v));
  const max = Math.max(...numbers, 0.0001);
  const bar = (v) => {
    if (v === undefined || v === '') return ['', '<span class="muted">-</span>'];
    if (isNaN(v)) return [v === 'red' ? 'red' : v === 'blue' ? 'blue' : '', v === 'tie' ? 'tie' : '', 50];
    return [+v < 0 ? 'red' : +v > 0 ? 'blue' : '', String(Math.abs(+v)), (50 * Math.abs(+v)) / max];
  };
  const blocks = order.map((r) => `<div><h4>${roundName(r)}</h4><table>${Object.keys(rounds[r]).sort((a, c) => a - c).map((j) => {
    const [side, text, width] = bar(overall(rounds[r][j]));
    return `<tr><td>${judge(j)}</td><td class="w"><span class="div ${side}"><i style="width:${width || 0}%"></i></span></td><td class="num">${text}</td></tr>`;
  }).join('')}</table></div>`).join('');
  const link = b.url ? ` · <a href="${esc(b.url)}" target="_blank" rel="noopener">Source page</a>` : '';
  return `<div class="rounds">${blocks}</div>
    <p class="key"><i style="background:var(--red)"></i>${breaker(b.red, keys.rk)}<i style="background:var(--blue)"></i>${breaker(b.blue, keys.bk)} · <a data-act="raw">All scores as numbers</a>${link}</p>
    <div class="raw" hidden>${scoreTables(rounds, b)}</div>`;
}

// the same battle as plain numbers, one table per round
function scoreTables(rounds, b) {
  let html = '';
  for (const r of roundOrder(rounds)) {
    const cats = [...new Set(Object.values(rounds[r]).flatMap((j) => Object.keys(j)))];
    html += `<h4>${roundName(r)}</h4><table><thead><tr><th>Judge</th>${cats.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>`;
    for (const j of Object.keys(rounds[r]).sort((a, c) => a - c)) {
      html += `<tr><td>${esc(b.judges[j - 1] || 'Judge ' + j)}</td>${cats.map((c) => `<td>${esc(rounds[r][j][c] ?? '')}</td>`).join('')}</tr>`;
    }
    html += '</tbody></table>';
  }
  return html + `<p class="note">Negative favors red (${esc(b.red)}), positive favors blue (${esc(b.blue)}).</p>`;
}

// ---- review
const PROBLEM = [
  [/page (says|lists)|decided/, 'Battles missing'], [/no battles found/, 'Stage empty'], [/layout not mapped/, 'Bracket too big'],
  [/could not tell/, 'Category unclear'], [/no export column/, 'More rounds or judges than the sheet holds'],
];
const REVIEW_SHOWN = 12;
let REVIEW = [], reviewAll = false;

function renderReview() {
  const shown = reviewAll ? REVIEW : REVIEW.slice(0, REVIEW_SHOWN);
  $('#review-table tbody').innerHTML = shown.map((r) => {
    const kind = (PROBLEM.find(([re]) => re.test(r.reason)) || [null, 'Needs a look'])[1];
    return `<tr><td>${esc(r.event)}<small>${esc(r.date)}</small></td><td>${esc(r.stage)}</td>
      <td><span class="status warn">${kind}</span><small>${esc(r.reason)}</small></td>
      <td class="num">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Source</a>` : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="muted">No collection problems.</td></tr>';
  $('#review-more').innerHTML = REVIEW.length > REVIEW_SHOWN
    ? `Showing ${shown.length} of ${REVIEW.length}. <a id="review-toggle" style="cursor:pointer">${reviewAll ? 'Show fewer' : 'Show all'}</a>` : '';
  const toggle = $('#review-toggle');
  if (toggle) toggle.onclick = () => { reviewAll = !reviewAll; renderReview(); };
}

function renderQuality(status) {
  const n = status.need_review || 0, total = status.battles + (status.uncertain || 0);
  $('#review-title').textContent = n ? `${n.toLocaleString()} null${n === 1 ? '' : 's'}` : 'No nulls';
  // one card per kind of gap: how many, what it is, why it happened, what fixes it
  const card = (q) => `<article class="nullcard ${q.count ? (q.action ? 'act' : 'info') : 'clear'}" title="${esc(q.fix)}"
      ${q.count && q.code ? `data-code="${q.code}" tabindex="0"` : ''} ${q.href ? `data-href="${q.href}" tabindex="0"` : ''}>
    <div><b>${q.count.toLocaleString()}</b><h3>${esc(q.label)}</h3></div>
    <p>${esc(q.why)}</p>
  </article>`;
  const problems = { label: 'Collection problems', count: status.review || 0, action: true, href: '#problems',
    why: 'Stages collected incompletely or not at all. Listed below.',
    fix: 'Listed below with a link to each source page.' };
  const checks = status.quality || [];
  // largest first
  $('#quality-cards').innerHTML = [...checks, problems].sort((a, b) => b.count - a.count).map(card).join('');
}

// "View" on a missing-values row opens the dataset filtered to those battles
const openNullCard = (e) => {
  const el = e.target.closest('.nullcard');
  if (!el || (e.type === 'keydown' && e.key !== 'Enter')) return;
  if (el.dataset.href) { document.querySelector(el.dataset.href).scrollIntoView({ behavior: 'smooth' }); return; }
  const code = el.dataset.code;
  if (!code || !DATA) return;
  Object.keys(colFilters).forEach((k) => delete colFilters[k]);
  $('#q').value = ''; qualityCode = code; page = 0;
  filter();
  goTab('dataset');
};
$('#quality-cards').addEventListener('click', openNullCard);
$('#quality-cards').addEventListener('keydown', openNullCard);

Promise.all([get('data/status.json'), Promise.resolve([])]).then(([s, a]) => {
  renderStatus(s, a);
  pollProgress();
  setInterval(pollProgress, 60000);                               // is a run going?
  setInterval(() => STATUS && renderStatus(STATUS, ACTIVITY), 15000);   // keep countdowns and the bar moving
});
get('data/news.json').then(renderNews).catch(() => renderNews(null));
get('data/review.json').then((items) => { REVIEW = items; renderReview(); });
get('data/battles.json').then(setupDataset);
