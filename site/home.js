// Home: the explainer page. Nothing here is needed by the other tabs.
(() => {
  const home = document.getElementById('home');
  if (!home) return;
  document.documentElement.classList.add('h-js');
  const q = (s) => home.querySelector(s);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the headline rises into place; if that animation never runs, it is put there anyway
  setTimeout(() => home.querySelector('.h-title').classList.add('set'), 1600);
  const shown = () => !home.hidden;
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---- things arrive as they are scrolled to
  home.querySelectorAll('.rv').forEach((el) => {
    const i = [...el.parentElement.children].filter((c) => c.classList.contains('rv')).indexOf(el);
    if (el.parentElement.matches('.h-moves, .h-tabs, .h-notes, .h-stages')) el.style.setProperty('--d', `${i * 0.08}s`);
    whenSeen(el, () => el.classList.add('in'));
  });
  home.querySelectorAll('[data-to]').forEach((b) => b.addEventListener('click', () =>
    document.getElementById(b.dataset.to).scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })));

  // ---- the timeline's line fills as far as the middle of the window
  const time = q('#h-time');
  const fill = () => {
    if (!shown()) return;
    const r = time.getBoundingClientRect();
    time.style.setProperty('--p', Math.max(0, Math.min(1, (innerHeight * 0.6 - r.top) / r.height)).toFixed(3));
  };
  addEventListener('scroll', fill, { passive: true });
  addEventListener('resize', fill);
  addEventListener('hashchange', () => requestAnimationFrame(fill));
  fill();

  // ---- numbers count up the first time they are seen
  function countUp(el, to) {
    if (still || !to) { el.textContent = (to || 0).toLocaleString(); return; }
    whenSeen(el, () => {
      const t0 = performance.now(), ms = 1500;
      const step = (now) => {
        const p = Math.min(1, (now - t0) / ms);
        el.textContent = Math.round(to * (1 - Math.pow(1 - p, 4))).toLocaleString();
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  fetch('data/status.json', { cache: 'no-cache' }).then((r) => r.json()).then((s) => {
    const T = s.totals || {};
    const stats = { battles: s.battles, events: s.events, decisions: T.decisions, breakers: T.breakers, judges: T.judges };
    home.querySelectorAll('[data-stat]').forEach((el) => countUp(el, stats[el.dataset.stat]));
    home.querySelectorAll('[data-src]').forEach((el) => countUp(el, (s.battles_by_source || {})[el.dataset.src]));
  }).catch(() => {});

  // ---- stage one: showcase scores, the best eight light up
  const scores = [62, 88, 45, 93, 71, 38, 80, 55, 97, 66, 49, 84, 74, 58];
  const cut = [...scores].sort((a, b) => b - a)[7];
  q('#h-bars').innerHTML = scores.map((h, i) => `<i class="${h >= cut ? 'top' : ''}" style="--h:${h};--i:${i}"></i>`).join('');

  // ---- stage two: eight in, one out
  (() => {
    const X = [12, 88, 164, 240, 300], ys = [...Array(8)].map((_, i) => 10 + i * 21.4);
    let parts = '', level = ys, winner = 2, wy = ys[winner], win = `M${X[0]},${wy}`;
    for (let l = 0; l < 3; l++) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        parts += `<path pathLength="1" style="--i:${l}" d="M${X[l]},${level[i]} H${X[l + 1]} V${level[i + 1]} H${X[l]}"/>`;
        next.push((level[i] + level[i + 1]) / 2);
      }
      winner = Math.floor(winner / 2);
      win += ` H${X[l + 1]} V${next[winner]}`;
      level = next;
    }
    parts += `<path pathLength="1" style="--i:3" d="M${X[3]},${level[0]} H${X[4]}"/>`;
    parts += `<path class="win" pathLength="1" style="--i:0" d="${win} H${X[4]}"/>`;
    parts += ys.map((y, i) => `<circle class="${i % 2 ? 'blue' : 'red'}" cx="${X[0]}" cy="${y}" r="3.5"/>`).join('');
    parts += `<circle class="champ" cx="${X[4]}" cy="${level[0]}" r="7"/>`;
    q('#h-bracket').innerHTML = parts;
  })();

  // ---- the judging desk: seat 3 is the visitor, the other four are split two against two
  const SYSTEMS = [
    { name: 'Traditional', unit: 'Battle', blurb: 'When the battle is over, each judge points to the side they think won, or crosses their arms for a tie. <b>The most votes wins.</b> No reasons given, no score along the way.', cats: [] },
    { name: 'Round-by-Round', unit: 'Round', blurb: 'The same pointing, but <b>after every round</b>. The majority takes the round, and whoever takes the most rounds takes the battle.', cats: [] },
    { name: 'Single Slider', unit: 'Round', blurb: 'After each round every judge sets <b>one slider</b>: how far one side outperformed the other, up to 100. The slider becomes a vote.', cats: [['Overall', 'over', 100]] },
    { name: 'Threefold', unit: 'Round', blurb: 'Three qualities, scored separately: <b>physical, artistic, interpretive</b>. A judge can favour one side on one and the other side on another. The sum is the vote.', cats: [['Physical', 'phys', 33.3], ['Artistic', 'arti', 33.3], ['Interpretive', 'inte', 33.3]] },
    { name: 'Trivium', unit: 'Round', blurb: 'The three qualities split into <b>six</b>. Physical is technique and variety, artistic is creativity and personality, interpretive is performance and musicality.', cats: [['Technique', 'tech', 20, 'Physical'], ['Variety', 'vari', 13.3, 'Physical'], ['Creativity', 'crea', 20, 'Artistic'], ['Personality', 'pers', 13.3, 'Artistic'], ['Performance', 'perf', 20, 'Interpretive'], ['Musicality', 'musi', 13.3, 'Interpretive']] },
    { name: 'WDSF System', unit: 'Round', blurb: 'Five qualities, up to 20 each. <b>This is the system used at the 2024 Olympic Games in Paris.</b>', cats: [['Technique', 'tech', 20], ['Vocabulary', 'voca', 20], ['Originality', 'orig', 20], ['Execution', 'exec', 20], ['Musicality', 'musi', 20]] },
  ];
  const OTHERS = [-0.34, 0.52, null, -0.61, 0.27];     // how far the other four lean, as a share of the most a judge can give
  const desk = q('#h-judge');
  let sys = 5, values = {}, pick = 0;
  const fmt = (n, whole) => (n > 0 ? '+' : n < 0 ? '−' : '') + (whole ? Math.abs(Math.round(n)) : Math.abs(n).toFixed(1).replace(/\.0$/, ''));
  const side = (n) => (n < 0 ? 'red' : n > 0 ? 'blue' : '');

  function drawDesk() {
    const S = SYSTEMS[sys];
    values = Object.fromEntries(S.cats.map((c) => [c[1], 0]));
    pick = 0;
    const controls = S.cats.length
      ? `<div class="j-sides"><span>Red</span><span>Blue</span></div>` + S.cats.map(([label, key, max, group]) => `<div class="j-row">
          <label for="j-${key}">${label}${group ? `<small>${group}</small>` : ''}</label>
          <input id="j-${key}" type="range" min="${-max}" max="${max}" step="${max === 100 ? 1 : 0.1}" value="0" data-key="${key}" data-max="${max}">
          <output></output></div>`).join('')
      : `<div class="j-pick"><button data-v="-1">Red</button><button data-v="0">Tie</button><button data-v="1">Blue</button></div>`;
    desk.innerHTML = `<div class="j-tabs" role="tablist">${SYSTEMS.map((s, i) => `<button role="tab" data-i="${i}" class="${i === sys ? 'on' : ''}">${s.name}</button>`).join('')}</div>
      <div class="j-body">
        <div class="j-you"><p class="j-blurb">${S.blurb}</p>${controls}<div class="j-cells" ${S.cats.length ? '' : 'hidden'}><div></div><p>This is how the dataset stores it: <b>r1</b> is round 1, <b>j3</b> is the judge in seat 3, then the quality in four letters. Negative favours red, positive favours blue.</p></div></div>
        <div class="j-panel"><h4>The panel</h4><div class="j-seats">${OTHERS.map((_, i) => `<div class="j-seat${i === 2 ? ' you' : ''}"><span>${i === 2 ? 'You' : `Seat ${i + 1}`}</span><b></b></div>`).join('')}</div>
          <div class="j-tally"><i></i><i></i></div><p class="j-result"></p><p class="j-why"></p><a class="j-more" href="#systems">See how each system behaves across real battles</a></div>
      </div>`;
    update();
  }

  function update() {
    const S = SYSTEMS[sys], sliders = S.cats.length > 0;
    const most = S.cats.reduce((sum, c) => sum + c[2], 0);
    const mine = sliders ? Object.values(values).reduce((a, b) => a + b, 0) : pick;
    desk.querySelectorAll('.j-row').forEach((row) => {
      const input = row.querySelector('input'), v = values[input.dataset.key], pct = 50 + (50 * v) / input.dataset.max;
      input.style.setProperty('--lo', Math.min(50, pct));
      input.style.setProperty('--hi', Math.max(50, pct));
      input.style.setProperty('--c', v < 0 ? css('--red') : css('--blue'));
      const out = row.querySelector('output');
      out.textContent = fmt(v, input.dataset.max === '100');
      out.className = side(v);
    });
    desk.querySelectorAll('.j-pick button').forEach((b) => b.classList.toggle('on', +b.dataset.v === pick && (pick !== 0 || desk.dataset.touched === '1')));
    const cells = desk.querySelector('.j-cells div');
    if (sliders) cells.innerHTML = S.cats.map((c) => `<span>r1j3${c[1]} <b class="${side(values[c[1]])}">${fmt(values[c[1]], c[2] === 100)}</b></span>`).join('');

    let red = 0, blue = 0;
    desk.querySelectorAll('.j-seat').forEach((seat, i) => {
      const n = i === 2 ? mine : OTHERS[i] * (sliders ? most : 1);
      red += n < 0; blue += n > 0;
      seat.classList.remove('red', 'blue');
      if (side(n)) seat.classList.add(side(n));
      const b = seat.querySelector('b');
      b.textContent = sliders ? fmt(n, i !== 2 || S.cats.length === 1) : n < 0 ? 'Red' : n > 0 ? 'Blue' : i === 2 ? '?' : 'Tie';
      b.className = side(n);
    });
    const tally = desk.querySelector('.j-tally');
    tally.style.setProperty('--r', red);
    tally.style.setProperty('--b', blue);
    const result = desk.querySelector('.j-result'), why = desk.querySelector('.j-why');
    result.className = 'j-result ' + (red > blue ? 'red' : blue > red ? 'blue' : '');
    if (red === blue) {
      result.textContent = 'Split, 2 to 2.';
      why.textContent = sliders ? 'Move a slider. Your vote decides it.' : 'Pick a side. Your vote decides it.';
    } else {
      result.textContent = `${S.unit} to ${red > blue ? 'red' : 'blue'}, 3 to 2.`;
      why.textContent = sliders
        ? `Your scores add up to ${fmt(mine, S.cats.length === 1)}, so your vote goes ${mine < 0 ? 'red' : 'blue'}. The size of the number does not matter, only its sign.`
        : S.unit === 'Battle' ? 'One vote the other way and the battle flips. Nobody has to say why.' : 'One round down. Win the most rounds to win the battle.';
    }
  }

  desk.addEventListener('input', (e) => {
    if (!e.target.dataset.key) return;
    values[e.target.dataset.key] = +e.target.value;
    update();
  });
  desk.addEventListener('click', (e) => {
    const tab = e.target.closest('.j-tabs button'), choice = e.target.closest('.j-pick button');
    if (tab) { sys = +tab.dataset.i; desk.dataset.touched = ''; drawDesk(); }
    if (choice) { pick = +choice.dataset.v; desk.dataset.touched = '1'; update(); }
  });
  drawDesk();

  // ---- the cypher: a ring of people, two breakers taking turns in the middle, five judges voting each round
  (() => {
    const canvas = q('#h-cypher'), ctx = canvas.getContext('2d');
    const roundLabel = q('#h-round'), pips = q('#h-pips');
    pips.innerHTML = '<i></i>'.repeat(5);
    const TAU = Math.PI * 2, TURN = 3.4, RED = css('--red') || '#e5484d', BLUE = css('--blue') || '#3e7fe6', FG = css('--fg') || '#f1f2f4';
    let W = 0, H = 0, seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const crowd = [...Array(64)].map((_, i) => ({ a: (i / 64) * TAU + rand() * 0.05, r: 0.86 + rand() * 0.1, s: 1.4 + rand() * 1.8, ph: rand() * TAU }));
    // each movement is a path through the circle, in units of its radius
    const MOVES = {
      toprock: (t) => [0.3 * Math.sin(t * 2.4) + 0.05 * Math.sin(t * 7), -0.16 + 0.07 * Math.sin(t * 4.8)],
      footwork: (t) => { const r = 0.3 + 0.07 * Math.sin(t * 5); return [r * Math.cos(t * 4.2), 0.16 + r * 0.5 * Math.sin(t * 4.2)]; },
      power: (t) => { const r = 0.14 + 0.2 * Math.abs(Math.sin(t * 1.1)); return [r * Math.cos(t * 11), r * Math.sin(t * 11)]; },
    };
    const ORDER = ['toprock', 'footwork', 'power'];
    const dancers = [{ c: RED, home: Math.PI * 0.94, x: -0.8, y: 0.1, trail: [] }, { c: BLUE, home: Math.PI * 0.06, x: 0.8, y: 0.1, trail: [] }];
    const bursts = [];
    let turn = -1, plan = [], frozen = false, votes = [];

    function resize() {
      const dpr = Math.min(2, devicePixelRatio || 1), box = canvas.getBoundingClientRect();
      W = box.width; H = box.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function newTurn(n) {
      turn = n;
      const sideNow = n % 2, round = Math.floor(n / 2) % 3;
      if (sideNow === 0 && n > 0) {                    // both have gone: the judges vote on the round just finished
        const lean = rand();
        votes = [...Array(5)].map(() => (rand() < 0.25 + lean * 0.5 ? 'red' : 'blue'));
        [...pips.children].forEach((p, i) => setTimeout(() => { p.className = votes[i]; }, i * 90));
        setTimeout(() => [...pips.children].forEach((p) => { p.className = ''; }), 1500);
      }
      roundLabel.textContent = `Round ${round + 1} · ${sideNow ? 'Blue' : 'Red'}`;
      const first = Math.floor(rand() * 3);
      plan = [ORDER[first], ORDER[(first + 1 + Math.floor(rand() * 2)) % 3]];
      frozen = false;
    }

    function frame(now) {
      const t = now / 1000, cx = W / 2, cy = H / 2 - 6, R = Math.min(W, H) * 0.44;
      const n = Math.floor(t / TURN), into = t - n * TURN;
      if (n !== turn) newTurn(n);
      const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.75)), 6);

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgb(255 255 255 / .06)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.74, 0, TAU); ctx.stroke();
      crowd.forEach((p) => {
        const r = R * (p.r + 0.012 * beat * Math.sin(p.ph + t));
        ctx.fillStyle = `rgb(241 242 244 / ${0.16 + 0.3 * beat * (0.5 + 0.5 * Math.sin(p.ph))})`;
        ctx.beginPath(); ctx.arc(cx + r * Math.cos(p.a), cy + r * Math.sin(p.a), p.s * (1 + 0.5 * beat), 0, TAU); ctx.fill();
      });

      const active = n % 2;
      dancers.forEach((d, i) => {
        let tx, ty, ease = 0.16;
        if (i !== active) {                            // waiting at the edge, nodding to the beat
          tx = 0.74 * Math.cos(d.home); ty = 0.74 * Math.sin(d.home) - 0.03 * beat; ease = 0.07;
        } else if (into > TURN - 0.75) {               // every set ends in a freeze
          if (!frozen) { frozen = true; bursts.push({ x: d.x, y: d.y, c: d.c, t }); }
          tx = d.fx; ty = d.fy; ease = 0.5;
        } else {
          [tx, ty] = MOVES[plan[into < (TURN - 0.75) / 2 ? 0 : 1]](t);
          d.fx = tx; d.fy = ty;
        }
        d.x += (tx - d.x) * ease; d.y += (ty - d.y) * ease;
        d.trail.push([d.x, d.y]);
        if (d.trail.length > (i === active ? 46 : 8)) d.trail.splice(0, d.trail.length - (i === active ? 46 : 8));
      });

      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      dancers.forEach((d) => {
        for (let k = 1; k < d.trail.length; k++) {
          const a = k / d.trail.length;
          ctx.strokeStyle = d.c; ctx.globalAlpha = a * a * 0.9; ctx.lineWidth = 1 + a * 9;
          ctx.beginPath();
          ctx.moveTo(cx + d.trail[k - 1][0] * R, cy + d.trail[k - 1][1] * R);
          ctx.lineTo(cx + d.trail[k][0] * R, cy + d.trail[k][1] * R);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.shadowColor = d.c; ctx.shadowBlur = 26;
        ctx.fillStyle = d.c;
        ctx.beginPath(); ctx.arc(cx + d.x * R, cy + d.y * R, 8, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = FG;
        ctx.beginPath(); ctx.arc(cx + d.x * R, cy + d.y * R, 3, 0, TAU); ctx.fill();
      });
      for (let k = bursts.length - 1; k >= 0; k--) {     // the ring a freeze sends out
        const b = bursts[k], age = (t - b.t) / 0.9;
        if (age > 1) { bursts.splice(k, 1); continue; }
        ctx.strokeStyle = b.c; ctx.globalAlpha = (1 - age) * 0.8; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx + b.x * R, cy + b.y * R, 10 + age * R * 0.42, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    let running = false;
    const loop = (now) => {
      if (!running) return;
      frame(now);
      requestAnimationFrame(loop);
    };
    let onScreen = true;
    const sync = () => {
      const want = shown() && onScreen && !document.hidden && !still;
      if (want && !running) { running = true; resize(); requestAnimationFrame(loop); }
      if (!want) running = false;
    };
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(canvas);
    addEventListener('hashchange', () => requestAnimationFrame(sync));
    document.addEventListener('visibilitychange', sync);
    addEventListener('resize', () => { if (shown()) resize(); });
    resize();
    if (still) { for (let i = 0; i < 90; i++) frame(1200 + i * 16); } else sync();
  })();
})();
