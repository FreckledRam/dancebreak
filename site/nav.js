// The tab bar's extras: the Data health menu, the phone menu, site search, and "next" links between tabs.
(() => {
  const header = $('header'), healthBtn = $('#health-btn'), healthPop = $('#health-pop'), menuBtn = $('#menu-btn');
  const find = $('#find'), results = $('#find-results');

  // ---- menus
  function closeMenus() {
    healthPop.hidden = true; healthBtn.setAttribute('aria-expanded', 'false');
    header.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false');
    results.hidden = true;
  }
  window.closeNavMenus = closeMenus;
  healthBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = healthPop.hidden;
    closeMenus();
    healthPop.hidden = !open; healthBtn.setAttribute('aria-expanded', String(open));
  });
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !header.classList.contains('open');
    closeMenus();
    header.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('nav')) closeMenus(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeMenus(); find.blur(); }
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); find.focus(); }
  });

  // ---- search: breakers, judges and events in one box
  let events = null, hits = [], at = 0;
  function eventNames() {
    if (events || !DATA) return events || [];
    const count = {};
    for (const r of DATA.rows) count[r[DATA.C.event]] = (count[r[DATA.C.event]] || 0) + 1;
    events = Object.entries(count).map(([name, n]) => ({ name, n }));
    return events;
  }
  // names that start with what was typed come first, then the ones with more battles
  function best(list, q, size, n) {
    return list.filter((x) => x.name.toLowerCase().includes(q))
      .sort((a, b) => b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q) || size(b) - size(a)).slice(0, n);
  }
  function search() {
    const q = find.value.trim().toLowerCase(), A = window.ANALYTICS;
    if (q.length < 2) { results.hidden = true; return; }
    hits = [
      ...(A ? best(A.breakers, q, (b) => b.n, 5).map((b) => ({ kind: 'Breaker', name: b.name, note: `${b.n} battles`, go: () => OPEN.breaker(b.k) })) : []),
      ...(A ? best(A.judges, q, (j) => j.battles, 3).map((j) => ({ kind: 'Judge', name: j.name, note: `${j.battles.toLocaleString()} battles judged`, go: () => OPEN.judge(j.k) })) : []),
      ...best(eventNames(), q, (e) => e.n, 4).map((e) => ({ kind: 'Event', name: e.name, note: `${e.n} battles`, go: () => findInDataset(e.name) })),
    ];
    at = 0;
    results.innerHTML = hits.map((h, i) => `<a data-i="${i}" class="${i ? '' : 'at'}"><small>${h.kind}</small><b>${esc(h.name)}</b><span>${h.note}</span></a>`).join('')
      || `<p class="muted">Nothing called that. Press Enter to search every battle.</p>`;
    results.hidden = false;
  }
  function choose(i) {
    const hit = hits[i], text = find.value.trim();
    find.value = ''; find.blur(); closeMenus();
    if (hit) hit.go(); else if (text) findInDataset(text);
  }
  find.addEventListener('input', search);
  find.addEventListener('focus', search);
  find.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); choose(results.hidden ? -1 : at); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    at = (at + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % Math.max(1, hits.length);
    results.querySelectorAll('a').forEach((a, i) => a.classList.toggle('at', i === at));
  });
  results.addEventListener('click', (e) => { const a = e.target.closest('a[data-i]'); if (a) choose(+a.dataset.i); });

  // ---- each tab ends by pointing at the next one, so the site can be walked through without the tab bar
  const TOUR = [
    ['dataset', 'Dataset', 'Every battle, with each judge\'s score'],
    ['breakers', 'Breakers', 'An Elo rating for every breaker'],
    ['judges', 'Judges', 'How each judge votes against the panel'],
    ['systems', 'Systems', 'How each judging system behaves'],
    ['news', 'News', 'Upcoming events and headlines'],
  ];
  TOUR.forEach(([id], i) => {
    const prev = TOUR[i - 1], next = TOUR[i + 1];
    const link = (t, word) => (t ? `<a href="#${t[0]}" class="${word.toLowerCase()}"><small>${word}</small><b>${t[1]}</b><span>${t[2]}</span></a>` : '<i></i>');
    document.getElementById(id).insertAdjacentHTML('beforeend', `<div class="tour">${link(prev, 'Previous')}${link(next, 'Next')}</div>`);
  });
})();
