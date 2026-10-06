// News: the tab laid out as a front page. Pictures load from the site that owns them; nothing is stored here.
(() => {
  const paper = document.getElementById('paper');
  if (!paper) return;
  const SOURCES = { and8: 'And8', wdsf: 'WDSF', breakkonnect: 'Break Konnect' };
  const INKS = ['yellow', 'red', 'blue', 'lime', 'pink', 'violet', 'orange'];      // poster colours, dealt in order
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const day = (iso) => new Date(iso + 'T12:00:00');
  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); };
  const daysTo = (iso) => Math.round((day(iso) - today()) / 864e5);
  const md = (iso) => day(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const country = (e) => e.place.split(', ').pop();

  function dateRange(e) {
    if (e.start === e.end) return md(e.start);
    return day(e.start).getMonth() === day(e.end).getMonth() ? `${md(e.start)}-${day(e.end).getDate()}` : `${md(e.start)} - ${md(e.end)}`;
  }
  function until(e) {
    const n = daysTo(e.start);
    return n <= 0 ? 'On now' : n === 1 ? 'Tomorrow' : n < 14 ? `In ${n} days` : n < 60 ? `In ${Math.round(n / 7)} weeks` : `In ${Math.round(n / 30)} months`;
  }
  // a picture that fails to load takes its frame with it
  const picture = (src, cls) => (src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '');
  const big = (src) => (src ? src.replace('/480x280/', '/930x540/') : src);      // the lead story gets the larger cut
  const out = 'target="_blank" rel="noopener"';
  const head = (label, note = '') => `<div class="np-h nv"><h2>${label}</h2><i></i><span>${note}</span></div>`;

  function draw(news) {
    const events = ((news && news.upcoming) || []).filter((e) => daysTo(e.end) >= 0);
    const features = (news && news.features) || [], wire = (news && news.headlines) || [];
    const now = new Date(), issue = Math.ceil((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
    const countries = {};
    events.forEach((e) => { if (country(e)) countries[country(e)] = (countries[country(e)] || 0) + 1; });
    const places = Object.entries(countries).sort((a, b) => b[1] - a[1]);
    const letters = (word, cls) => [...word].map((c, i) => `<b class="${cls}" style="--i:${i}">${c}</b>`).join('');

    const mast = `<div class="np-mast">
      <div class="np-top"><span>Vol. 1 &middot; No. ${issue}</span><span>${now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span><span>${news && news.updated ? `Updated ${ago(news.updated)}` : ''}</span></div>
      <h1 class="np-name" aria-label="Break News">${letters('Break', 'a')}<i></i>${letters('News', 'b')}</h1>
      <div class="np-motto"><span>All the breaking that is fit to print</span><span><b>${events.length}</b> events ahead in <b>${places.length}</b> countries</span></div>
    </div>`;

    if (!events.length && !features.length && !wire.length) {
      paper.innerHTML = `${mast}<p class="np-empty">The presses are quiet. Nothing has been collected yet.</p>`;
      return;
    }

    const tick = events.slice(0, 14).map((e) => `<a href="${esc(e.url)}" ${out}><b>${dateRange(e)}</b>${esc(e.name)}<em>${esc(e.place)}</em></a>`).join('');
    const ticker = events.length ? `<div class="np-ticker"><strong>Next up</strong><div class="belt"><div>${tick}${tick}</div></div></div>` : '';

    const lead = features[0], next = events[0];
    const front = `<div class="np-front">
      ${lead ? `<a class="np-lead nv" href="${esc(lead.url)}" ${out}>
        <figure>${picture(big(lead.image), '')}<figcaption>Top story</figcaption></figure>
        <h3>${esc(lead.title)}</h3>
        <p>${esc(lead.source)} &middot; ${md(lead.date)}</p>
      </a>` : ''}
      ${next ? `<a class="np-count nv" href="${esc(next.url)}" ${out} data-start="${next.start}">
        <strong class="shout">${(daysTo(next.start) <= 0 ? 'On the floor now' : 'Next battle in').split(' ').map((w, i) => `<b style="--i:${i}">${w}</b>`).join(' ')}</strong>
        <div class="clock" id="np-clock">${['days', 'hrs', 'min', 'sec'].map((u) => `<span><b data-u="${u}">00</b><i>${u}</i></span>`).join('')}</div>
        <h3>${esc(next.name)}</h3>
        <p>${dateRange(next)}${next.place ? ` &middot; ${esc(next.place)}` : ''}</p>
        <em>Go to the event</em>
      </a>` : ''}
    </div>`;

    const week = events.filter((e) => daysTo(e.start) <= 7), posters = (week.length >= 4 ? week : events).slice(0, 12);
    const floor = posters.length ? `${head(week.length >= 4 ? 'This week on the floor' : 'Coming to a floor near you', `${posters.length} events`)}
      <div class="np-posters">${posters.map((e, i) => `<a class="poster ${INKS[i % INKS.length]} nv" style="--d:${(i % 6) * 0.06}s" href="${esc(e.url)}" ${out}>
        ${picture(e.image, 'bg')}
        <span class="stamp">${until(e)}</span>
        <span class="dn">${day(e.start).getDate()}</span>
        <span class="mon">${day(e.start).toLocaleDateString([], { month: 'short' })}${e.start !== e.end ? ` &ndash; ${md(e.end)}` : ''}</span>
        <b>${esc(e.name)}</b>
        <small>${esc(e.place)}</small>
      </a>`).join('')}</div>` : '';

    const more = features.slice(1, 3), rest = [...features.slice(3), ...wire].sort((a, b) => b.date.localeCompare(a.date));
    const stories = more.length || rest.length ? `${head('The wire', 'Headlines from around the scene')}
      <div class="np-mid">
        <div class="stack">${more.map((a, i) => `<a class="np-story nv" style="--d:${i * 0.08}s" href="${esc(a.url)}" ${out}>
          <figure>${picture(big(a.image), '')}</figure><h3>${esc(a.title)}</h3><p>${esc(a.source)} &middot; ${md(a.date)}</p></a>`).join('')}</div>
        <div class="np-wire nv">
          <h4>Just in</h4>
          <ol>${rest.slice(0, 8).map((a) => `<li><a href="${esc(a.url)}" ${out}><b>${esc(a.title)}</b><span>${esc(a.source)} &middot; ${md(a.date)}</span></a></li>`).join('')}</ol>
        </div>
      </div>` : '';

    const majors = events.filter((e) => e.source === 'wdsf').slice(0, 3);
    const circle = majors.length ? `${head('Circle the date', 'The federation\'s majors')}
      <div class="np-majors">${majors.map((e, i) => `<a class="nv" style="--d:${i * 0.08}s" href="${esc(e.url)}" ${out}>
        <span class="ring"><b>${Math.max(0, daysTo(e.start))}</b><i>days</i></span>
        <div><h3>${esc(e.name)}</h3><p>${dateRange(e)} &middot; ${esc(e.place)}</p></div></a>`).join('')}</div>` : '';

    let month = '';
    const calendar = events.length ? `${head('The calendar', `${events.length} events`)}
      <div class="np-cal nv">${events.map((e) => {
        const m = day(e.start).toLocaleDateString([], { month: 'long', year: 'numeric' }), h = m === month ? '' : `<h4>${m}</h4>`;
        month = m;
        return `${h}<a href="${esc(e.url)}" ${out}><time>${dateRange(e)}</time><b>${esc(e.name)}</b><span>${esc([e.place, SOURCES[e.source]].filter(Boolean).join(' · '))}</span></a>`;
      }).join('')}</div>` : '';

    const top = places.slice(0, 8), most = top.length ? top[0][1] : 1;
    const world = top.length > 2 ? `${head('Around the world', 'Where the next battles are')}
      <div class="np-world nv">${top.map(([name, n], i) => `<div class="${INKS[i % INKS.length]}"><span>${esc(name)}</span><i style="--w:${Math.round((100 * n) / most)}%;--d:${i * 0.07}s"></i><b>${n}</b></div>`).join('')}</div>` : '';

    paper.innerHTML = mast + ticker + front + floor + stories + circle + calendar + world;

    paper.querySelectorAll('.nv').forEach((el) => whenSeen(el, () => el.classList.add('in')));
    requestAnimationFrame(sweepSeen);
    // the masthead letters drop into place; if that animation never runs, they are put there anyway
    setTimeout(() => paper.querySelector('.np-name')?.classList.add('set'), 1800);
    runClock();
  }

  // the countdown to the next event's first day, ticking only while the page is being looked at
  let timer = null;
  function runClock() {
    clearInterval(timer);
    const box = paper.querySelector('.np-count');
    if (!box) return;
    const target = new Date(box.dataset.start + 'T00:00:00');
    const step = () => {
      if (paper.offsetParent === null || document.hidden) return;
      const s = Math.max(0, Math.floor((target - Date.now()) / 1000));
      const parts = { days: Math.floor(s / 86400), hrs: Math.floor(s / 3600) % 24, min: Math.floor(s / 60) % 60, sec: s % 60 };
      box.querySelectorAll('[data-u]').forEach((b) => {
        const text = String(parts[b.dataset.u]).padStart(2, '0');
        if (b.textContent === text) return;
        b.textContent = text;
        if (!still) { b.classList.remove('flip'); void b.offsetWidth; b.classList.add('flip'); }
      });
    };
    step();
    timer = setInterval(step, 1000);
    addEventListener('hashchange', () => requestAnimationFrame(step));
  }

  document.documentElement.classList.add('np-js');
  get('data/news.json').then(draw).catch(() => draw(null));
})();
