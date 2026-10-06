// The tab bar's extras: the phone menu, site search, and "next" links between tabs.
(() => {
  const header = $('header'), menuBtn = $('#menu-btn');
  const searchBox = $('#nav-search'), findBtn = $('#find-btn');
  const find = $('#find'), results = $('#find-results');

  // ---- menus
  function closeMenus() {
    header.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false');
    results.hidden = true;
  }
  window.closeNavMenus = closeMenus;
  // the magnifying glass opens into a search bar, and closes again when left empty
  function openSearch(open) {
    searchBox.classList.toggle('open', open);
    findBtn.setAttribute('aria-expanded', String(open));
    if (open) find.focus(); else { find.value = ''; results.hidden = true; find.blur(); }
  }
  findBtn.addEventListener('click', (e) => { e.stopPropagation(); openSearch(!searchBox.classList.contains('open')); });
  find.addEventListener('blur', () => setTimeout(() => { if (!find.value && document.activeElement !== find) searchBox.classList.remove('open'); }, 150));
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !header.classList.contains('open');
    closeMenus();
    header.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('nav')) closeMenus(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeMenus(); openSearch(false); }
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(true); }
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
      ...(A ? best(A.breakers, q, (b) => b.n, 5).map((b) => ({ kind: 'Breaker', name: b.name, note: `${b.n} battles`, size: b.n, go: () => OPEN.breaker(b.k) })) : []),
      ...(A ? best(A.judges, q, (j) => j.battles, 3).map((j) => ({ kind: 'Judge', name: j.name, note: `${j.battles.toLocaleString()} battles judged`, size: j.battles, go: () => OPEN.judge(j.k) })) : []),
      ...best(eventNames(), q, (e) => e.n, 4).map((e) => ({ kind: 'Event', name: e.name, note: `${e.n} battles`, size: e.n, go: () => OPEN.event(e.name) || findInDataset(e.name) })),
    ];
    // across the three kinds: an exact name first, then a name that starts with it, then whoever has the most battles
    const fit = (h) => (h.name.toLowerCase() === q ? 2 : h.name.toLowerCase().startsWith(q) ? 1 : 0);
    hits.sort((a, b) => fit(b) - fit(a) || b.size - a.size);
    at = 0;
    results.innerHTML = hits.map((h, i) => `<a data-i="${i}" class="${i ? '' : 'at'}"><small>${h.kind}</small><b>${esc(h.name)}</b><span>${h.note}</span></a>`).join('')
      || `<p class="muted">Nothing called that. Press Enter to search every battle.</p>`;
    results.hidden = false;
  }
  function choose(i) {
    const hit = hits[i], text = find.value.trim();
    closeMenus(); openSearch(false);
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

  // ---- the logo's bars rise and fall in a wave for as long as the mouse is moving, and settle when it stops
  (() => {
    const bars = [...document.querySelectorAll('.brand .mark i')];
    if (!bars.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let lastMove = -1e9, level = 0, phase = 0, before = 0, running = false;
    const frame = (now) => {
      const dt = Math.min(50, now - before) / 1000;
      before = now;
      const moving = now - lastMove < 140;
      level += ((moving ? 1 : 0) - level) * Math.min(1, dt * (moving ? 7 : 3.2));     // swell in quickly, die away slowly
      phase += dt * 7.5 * (0.35 + 0.65 * level);
      bars.forEach((bar, i) => { bar.style.transform = `scaleY(${(1 + 0.3 * level * Math.sin(phase - i * 1.25)).toFixed(3)})`; });
      if (level < 0.004 && !moving) { bars.forEach((bar) => { bar.style.transform = ''; }); running = false; return; }
      requestAnimationFrame(frame);
    };
    addEventListener('mousemove', () => {
      lastMove = performance.now();
      if (!running) { running = true; before = lastMove; requestAnimationFrame(frame); }
    }, { passive: true });
  })();

  // ---- each tab ends by pointing at the next one, so the site can be walked through without the tab bar
  const TOUR = [
    ['news', 'News', 'Upcoming events and headlines'],
    ['breakers', 'Breakers', 'An Elo rating for every breaker'],
    ['judges', 'Judges', 'How each judge votes, and how each system behaves'],
    ['events', 'Events', 'Size, field strength and closeness of every event'],
  ];
  TOUR.forEach(([id], i) => {
    const prev = TOUR[i - 1], next = TOUR[i + 1];
    const link = (t, word) => (t ? `<a href="#${t[0]}" class="${word.toLowerCase()}"><small>${word}</small><b>${t[1]}</b><span>${t[2]}</span></a>` : '<i></i>');
    document.getElementById(id).insertAdjacentHTML('beforeend', `<div class="tour">${link(prev, 'Previous')}${link(next, 'Next')}</div>`);
  });
})();
