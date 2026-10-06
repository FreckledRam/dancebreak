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

  // ---- the cypher, seen from above: a ring of people, two breakers taking turns in the middle, five judges voting.
  // Everyone is drawn from simple shapes: a head, shoulders, two arms and two legs. A move is a function that
  // says where those joints are at a moment in time; the drawn joints chase those targets, so one move flows into the next.
  (() => {
    const canvas = q('#h-cypher'), ctx = canvas.getContext('2d');
    const roundLabel = q('#h-round'), pips = q('#h-pips');
    pips.innerHTML = '<i></i>'.repeat(5);
    const TAU = Math.PI * 2, TURN = 5.8, FREEZE = 0.9, PARTS = 4;
    const RED = css('--red') || '#e5484d', BLUE = css('--blue') || '#3e7fe6', FG = css('--fg') || '#f1f2f4';
    let W = 0, H = 0, seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const turn2 = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
    const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

    // A pose, in body lengths around the breaker's spot: c centre, rot which way the shoulders lie,
    // head, hands [left, right], feet [left, right]. "facing" turns the whole pose.
    const facingPose = (local, facing) => ({
      c: turn2(local.c, facing), rot: local.rot + facing, head: turn2(local.head, facing),
      hands: local.hands.map((h) => turn2(h, facing)), feet: local.feet.map((f) => turn2(f, facing)), low: local.low || 0,
    });
    const MOVES = {
      // standing: weight rocks from side to side, one foot steps out front and the arms swing against it
      toprock(t, face) {
        const b = t * 6.2, sway = Math.sin(b);
        return facingPose({
          c: [0.5 * Math.sin(b / 2), 0.1 * Math.cos(b)], rot: 0.3 * sway,
          head: [0.5 * Math.sin(b / 2) + 0.05 * sway, 0.06],
          hands: [[0.5 * Math.sin(b / 2) - 0.72, 0.42 * sway], [0.5 * Math.sin(b / 2) + 0.72, -0.42 * sway]],
          feet: [[0.5 * Math.sin(b / 2) - 0.2 + 0.25 * Math.max(0, sway), 0.62 * Math.max(0, sway)], [0.5 * Math.sin(b / 2) + 0.2 - 0.25 * Math.max(0, -sway), 0.62 * Math.max(0, -sway)]],
        }, face + 0.5 * Math.sin(t * 0.9));
      },
      // standing: a wide step out to each side, the arms opening with it and closing as the feet come back
      sidestep(t, face) {
        const b = t * 5.4, out = Math.sin(b), open = Math.abs(out);
        return facingPose({
          c: [0.75 * out, 0], rot: 0.18 * out, head: [0.8 * out, 0.05],
          hands: [[0.75 * out - 0.5 - 0.45 * open, 0.15], [0.75 * out + 0.5 + 0.45 * open, 0.15]],
          feet: [[0.75 * out - 0.18 - 0.4 * Math.max(0, -Math.cos(b)), 0.1], [0.75 * out + 0.18 + 0.4 * Math.max(0, Math.cos(b)), 0.1]],
        }, face);
      },
      // standing: one foot crosses over in front of the other and the shoulders twist against it
      crossover(t, face) {
        const b = t * 6.8, x = Math.sin(b);
        return facingPose({
          c: [0, 0.18 * Math.abs(x)], rot: -0.55 * x, head: [0, 0.2 * Math.abs(x) + 0.05],
          hands: [[-0.55 + 0.25 * x, 0.5 * x], [0.55 + 0.25 * x, -0.5 * x]],
          feet: [[-0.2 + 0.55 * Math.max(0, x), 0.5 * Math.max(0, x)], [0.2 - 0.55 * Math.max(0, -x), 0.5 * Math.max(0, -x)]],
        }, face + 0.9 * Math.sin(t * 1.3));
      },
      // down on the floor: the hands stay near one spot and the body and legs walk a circle around them
      footwork(t) {
        const w = t * 5.4, c = polar(0.5, w), kick = 0.3 * Math.sin(w * 2);
        return { c, rot: w + Math.PI / 2, head: polar(0.2, w), low: 1,
          hands: [polar(0.24, w + 2.3), polar(0.24, w - 2.3)],
          feet: [add(c, polar(1.15, w + 0.45 + kick)), add(c, polar(0.95, w - 0.5 + kick))] };
      },
      // down on the floor: sitting back on the hands while the legs kick out one after the other
      kicks(t, face) {
        const b = t * 7.5, x = Math.sin(b);
        return facingPose({
          c: [0.1 * x, -0.1], rot: 0.25 * x, head: [0.1 * x, -0.3], low: 1,
          hands: [[-0.55, -0.62], [0.55, -0.62]],
          feet: [[-0.3 - 0.35 * Math.max(0, x), 0.45 + 0.95 * Math.max(0, x)], [0.3 + 0.35 * Math.max(0, -x), 0.45 + 0.95 * Math.max(0, -x)]],
        }, face);
      },
      // down on the floor: crouched over one foot while the other leg sweeps a full circle around it
      sweep(t) {
        const w = t * 7.2;
        return { c: [0, 0], rot: w * 0.5, head: polar(0.18, w + Math.PI), low: 1,
          hands: [polar(0.55, w + Math.PI + 0.6), polar(0.55, w + Math.PI - 0.6)],
          feet: [polar(1.45, w), polar(0.28, w + Math.PI)] };
      },
      // on the hands with the legs straddled wide, the hips swinging round and round
      flare(t) {
        const w = t * 8.5, c = polar(0.42, w);
        return { c, rot: w + Math.PI / 2, head: add(c, polar(0.4, w + Math.PI)), low: 1,
          hands: [polar(0.22, w + Math.PI + 1.1), polar(0.22, w + Math.PI - 1.1)],
          feet: [add(c, polar(1.5, w + 0.9)), add(c, polar(1.5, w - 0.9))] };
      },
      // on the head: everything is stacked over one point, so from above it is a tight shape turning very fast
      headspin(t) {
        const w = t * 17, spread = 0.55 + 0.35 * Math.sin(t * 3.1);
        return { c: [0, 0], rot: w, head: [0, 0], low: 0,
          hands: [polar(0.48, w + 0.3), polar(0.48, w + Math.PI + 0.3)],
          feet: [polar(0.4 + 0.5 * spread, w + Math.PI / 2 + spread), polar(0.4 + 0.5 * spread, w - Math.PI / 2 - spread)] };
      },
      // hand to hand: the body flips over in half turns, the legs whipping round after it each time
      swipe(t) {
        const beat = t * 2.4, step = Math.floor(beat), f = beat - step, w = (step + f * f * (3 - 2 * f)) * Math.PI;
        const c = polar(0.25, w);
        return { c, rot: w, head: add(c, polar(0.4, w + Math.PI / 2)), low: 1,
          hands: [add(c, polar(0.75, w + 2.2)), add(c, polar(0.75, w + 0.95))],
          feet: [add(c, polar(1.4, w - Math.PI / 2 - 0.35 - 0.5 * Math.sin(f * Math.PI))), add(c, polar(1.25, w - Math.PI / 2 + 0.45))] };
      },
      // spinning on the back and shoulders: the whole body turns fast with the legs flung wide in a V
      power(t) {
        const w = t * 12.5, c = polar(0.1, t * 3);
        return { c, rot: w, head: add(c, polar(0.42, w + Math.PI / 2)), low: 1,
          hands: [add(c, polar(0.5, w + 2.6)), add(c, polar(0.5, w + 0.55))],
          feet: [add(c, polar(1.5, w - Math.PI / 2 - 0.6)), add(c, polar(1.5, w - Math.PI / 2 + 0.6))] };
      },
    };
    // held shapes to end a set on: one hand planted, the legs stacked in the air
    const FREEZES = [
      { c: [0, 0], rot: 0.5, head: [0.12, 0.46], hands: [[-0.78, 0.22], [0.42, 0.6]], feet: [[-0.5, -1.15], [0.82, -0.6]], low: 1 },
      { c: [0, 0], rot: -0.9, head: [-0.4, 0.3], hands: [[-0.75, -0.1], [-0.2, 0.75]], feet: [[0.95, -0.25], [0.6, -0.95]], low: 1 },
      { c: [0, 0], rot: 0.1, head: [0, 0.5], hands: [[-0.55, 0.62], [0.55, 0.62]], feet: [[-0.9, -1.0], [0.25, -1.35]], low: 1 },
      { c: [0, 0], rot: 1.2, head: [0.45, 0.2], hands: [[0.78, -0.15], [0.3, 0.72]], feet: [[-1.05, 0.3], [-0.7, -0.9]], low: 1 },
      { c: [0, 0], rot: -0.3, head: [-0.1, 0.5], hands: [[-0.3, 0.78], [0.72, 0.35]], feet: [[0.2, -1.45], [-0.85, -0.75]], low: 1 },
      { c: [0, 0], rot: 0.9, head: [0.3, -0.35], hands: [[0.82, 0.1], [0.1, -0.78]], feet: [[-1.35, 0.35], [-0.6, 1.0]], low: 1 },
      { c: [0, 0], rot: 0, head: [0, -0.1], hands: [[-0.95, 0.1], [0.95, 0.1]], feet: [[-0.25, -1.3], [0.25, -1.3]], low: 1 },
    ];
    // what a set is built from, and how tightly the drawn joints follow each kind (a spin smears if followed loosely)
    const KINDS = { stand: ['toprock', 'sidestep', 'crossover'], floor: ['footwork', 'kicks', 'sweep'], power: ['power', 'flare', 'headspin', 'swipe'] };
    const EASE = { stand: 0.2, floor: 0.3, power: 0.45 };
    const KIND_OF = Object.fromEntries(Object.entries(KINDS).flatMap(([kind, names]) => names.map((n) => [n, kind])));
    const lastUsed = {};
    const pick = (kind) => {                              // never the move this kind used last time
      const choices = KINDS[kind].filter((n) => n !== lastUsed[kind]);
      return (lastUsed[kind] = choices[Math.floor(rand() * choices.length)]);
    };

    const blank = () => ({ c: [0, 0], rot: 0, head: [0, 0], hands: [[-0.6, 0], [0.6, 0]], feet: [[-0.2, 0], [0.2, 0]], low: 0 });
    const dancers = [RED, BLUE].map((c, i) => ({ c, home: Math.PI * (i ? 0.06 : 0.94), spot: polar(0.74, Math.PI * (i ? 0.06 : 0.94)), now: blank(), trails: [[], []] }));
    const crowd = [...Array(26)].map((_, i) => ({ a: (i / 26) * TAU + (rand() - 0.5) * 0.09, r: 0.95 + rand() * 0.07, s: 0.72 + rand() * 0.3, ph: rand() * TAU, claps: rand() < 0.4 }));
    const bursts = [];
    let turn = -1, plan = [], frozen = false, freeze = FREEZES[0], freezeFace = 0, votes = [];

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
        setTimeout(() => [...pips.children].forEach((p) => { p.className = ''; }), 1700);
      }
      roundLabel.textContent = `Round ${round + 1} · ${sideNow ? 'Blue' : 'Red'}`;
      // every set opens standing, then goes down: floor work and power in either order, and one more of either to close
      const middle = rand() < 0.5 ? ['floor', 'power'] : ['power', 'floor'];
      plan = [pick('stand'), pick(middle[0]), pick(middle[1]), pick(rand() < 0.5 ? 'floor' : 'power')];
      freeze = FREEZES.filter((f) => f !== freeze)[Math.floor(rand() * (FREEZES.length - 1))];
      freezeFace = rand() * TAU;
      frozen = false;
    }

    // one person from above: legs, arms, shoulders, head. S is a body length in pixels.
    function person(ctx, p, at, S, colour, alpha = 1) {
      const P = (v) => [at[0] + v[0] * S, at[1] + v[1] * S];
      const axis = polar(1, p.rot), c = P(p.c);
      const limb = (from, to, width, bend) => {
        const a = P(from), b = P(to), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const nx = -(b[1] - a[1]) * bend, ny = (b[0] - a[0]) * bend;       // a knee or an elbow: the midpoint pushed sideways
        ctx.lineWidth = width * S;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(mx + nx, my + ny, b[0], b[1]); ctx.stroke();
        ctx.beginPath(); ctx.arc(b[0], b[1], width * S * 0.62, 0, TAU); ctx.fill();
      };
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      ctx.strokeStyle = ctx.fillStyle = colour;
      ctx.globalAlpha = alpha * 0.62;                                       // legs sit lowest, so they are drawn dimmer
      p.feet.forEach((f, i) => limb(add(p.c, [axis[0] * (i ? 0.2 : -0.2), axis[1] * (i ? 0.2 : -0.2)]), f, 0.21, i ? -0.22 : 0.22));
      ctx.globalAlpha = alpha * 0.82;
      p.hands.forEach((h, i) => limb(add(p.c, [axis[0] * (i ? 0.44 : -0.44), axis[1] * (i ? 0.44 : -0.44)]), h, 0.15, i ? 0.25 : -0.25));
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.ellipse(c[0], c[1], 0.52 * S, (0.27 + 0.07 * p.low) * S, p.rot, 0, TAU); ctx.fill();
      const h = P(p.head);
      ctx.fillStyle = FG;
      ctx.beginPath(); ctx.arc(h[0], h[1], 0.23 * S, 0, TAU); ctx.fill();
      ctx.lineWidth = 0.06 * S; ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      const t = now / 1000, cx = W / 2, cy = H / 2 - 6, R = Math.min(W, H) * 0.44, S = R * 0.2;
      const n = Math.floor(t / TURN), into = t - n * TURN;
      if (n !== turn) newTurn(n);
      const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.75)), 6);

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgb(255 255 255 / .07)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.74, 0, TAU); ctx.stroke();

      // the crowd: shoulders turned to the middle, leaning in on the beat, some of them clapping
      crowd.forEach((p) => {
        const lean = 0.03 * beat * (0.5 + 0.5 * Math.sin(p.ph)), at = add([cx, cy], polar(R * (p.r - lean), p.a));
        const inward = p.a + Math.PI, reach = p.claps ? 0.25 + 0.3 * beat : 0.12, gap = p.claps ? 0.5 - 0.38 * beat : 0.6;
        person(ctx, { c: [0, 0], rot: inward + Math.PI / 2, head: polar(0.05, inward), low: 0,
          hands: [add(polar(reach, inward), polar(gap, inward + Math.PI / 2)), add(polar(reach, inward), polar(gap, inward - Math.PI / 2))],
          feet: [polar(0.2, inward + 1.9), polar(0.2, inward - 1.9)] }, at, S * 0.46 * p.s, '#8a92a1', 0.42 + 0.25 * beat);
      });

      const active = n % 2;
      dancers.forEach((d, i) => {
        const toMiddle = Math.atan2(-d.spot[1], -d.spot[0]) - Math.PI / 2;
        let spot, target, ease = 0.2;
        if (i !== active) {                            // waiting at the edge of the circle, rocking to the beat
          spot = polar(0.74, d.home);
          target = MOVES.toprock(t * 0.55 + i, toMiddle);
          target.c = [target.c[0] * 0.3, target.c[1] * 0.3]; target.head = [target.head[0] * 0.3, target.head[1] * 0.3];
          target.hands = target.hands.map((h) => [h[0] * 0.75, h[1] * 0.75]); target.feet = target.feet.map((f) => [f[0] * 0.6, f[1] * 0.6]);
          ease = 0.1;
        } else if (into > TURN - FREEZE) {             // every set ends in a freeze
          spot = d.spot;
          if (!frozen) { frozen = true; bursts.push({ at: [...d.spot], c: d.c, t }); }
          target = facingPose(freeze, freezeFace); ease = 0.34;
        } else {
          const part = (TURN - FREEZE) / PARTS, move = plan[Math.min(PARTS - 1, Math.floor(into / part))];
          spot = polar(0.14, t * 0.5 + i * 3);
          target = MOVES[move](t, toMiddle);
          ease = EASE[KIND_OF[move]];
        }
        // the spot and every joint chase their targets: this is what turns separate moves into one run
        const follow = (cur, to, k) => { cur[0] += (to[0] - cur[0]) * k; cur[1] += (to[1] - cur[1]) * k; };
        follow(d.spot, spot, i === active ? 0.05 : 0.04);
        const p = d.now;
        follow(p.c, target.c, ease); follow(p.head, target.head, ease);
        p.hands.forEach((h, k) => follow(h, target.hands[k], ease));
        p.feet.forEach((f, k) => follow(f, target.feet[k], ease));
        let turnBy = (target.rot - p.rot) % TAU;                              // shoulders take the short way round
        if (turnBy > Math.PI) turnBy -= TAU; else if (turnBy < -Math.PI) turnBy += TAU;
        p.rot += turnBy * Math.min(1, ease * 1.4);
        p.low += ((target.low || 0) - p.low) * 0.15;

        const at = [cx + d.spot[0] * R, cy + d.spot[1] * R];
        // the feet leave a streak, which is most of what a fast move looks like from above
        p.feet.forEach((f, k) => {
          const trail = d.trails[k];
          trail.push([at[0] + f[0] * S, at[1] + f[1] * S]);
          if (trail.length > (i === active ? 16 : 1)) trail.splice(0, trail.length - (i === active ? 16 : 1));
          ctx.strokeStyle = d.c; ctx.lineCap = 'round';
          for (let j = 1; j < trail.length; j++) {
            const a = j / trail.length;
            ctx.globalAlpha = a * a * 0.3; ctx.lineWidth = S * 0.2 * a;
            ctx.beginPath(); ctx.moveTo(trail[j - 1][0], trail[j - 1][1]); ctx.lineTo(trail[j][0], trail[j][1]); ctx.stroke();
          }
        });
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgb(0 0 0 / .22)';                                   // a soft shadow pins the figure to the floor
        ctx.beginPath(); ctx.ellipse(at[0] + p.c[0] * S + 3, at[1] + p.c[1] * S + 5, 0.7 * S, 0.5 * S, 0, 0, TAU); ctx.fill();
        person(ctx, p, at, S, d.c);
      });

      for (let k = bursts.length - 1; k >= 0; k--) {     // the ring a freeze sends out
        const b = bursts[k], age = (t - b.t) / 0.9;
        if (age > 1) { bursts.splice(k, 1); continue; }
        ctx.strokeStyle = b.c; ctx.globalAlpha = (1 - age) * 0.8; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx + b.at[0] * R, cy + b.at[1] * R, S * 1.2 + age * R * 0.42, 0, TAU); ctx.stroke();
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
