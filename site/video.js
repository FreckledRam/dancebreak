// Video analysis tab: skeleton-tracked battle footage. Videos and pose data are hotlinked from the
// public breakdance-site (Sushimaster124/breakdance-site), so nothing heavy is stored in this repo.
(() => {
  const SRC = 'https://sushimaster124.github.io/breakdance-site/';
  const root = document.getElementById('va');
  if (!root) return;
  let loaded = false, jobs = [], cur = null;

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function load() {
    if (loaded) return;
    loaded = true;
    try {
      jobs = (await (await fetch(SRC + 'api/jobs.json')).json()).filter((j) => j.status === 'done');
    } catch {
      root.innerHTML = '<p class="sub">Could not load the videos. Try again later.</p>';
      return;
    }
    if (!jobs.length) { root.innerHTML = '<p class="sub">No videos yet.</p>'; return; }
    root.innerHTML = `
      <div class="va-pick">${jobs.map((j, i) => `<button data-i="${i}"><b>${esc(j.first)}</b> vs <b>${esc(j.second)}</b></button>`).join('')}</div>
      <div class="va-stage"><video id="va-video" controls playsinline preload="metadata"></video></div>
      <div class="va-bar" id="va-bar"><i class="va-head"></i></div>
      <div class="nums" id="va-nums"></div>
      <h2>Rounds</h2>
      <table class="va-turns"><thead><tr><th title="Which breaker is dancing">Breaker</th><th title="Where the round starts and ends in this clip">Time</th><th title="Length of the round">Length</th></tr></thead><tbody id="va-turns"></tbody></table>
      <p class="note foot" id="va-links"></p>`;
    root.querySelector('.va-pick').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) pick(+b.dataset.i);
    });
    const v = $('#va-video');
    v.addEventListener('timeupdate', tick);
    $('#va-bar').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      if (v.duration) v.currentTime = ((e.clientX - r.left) / r.width) * v.duration;
    });
    $('#va-turns').addEventListener('click', (e) => {
      const tr = e.target.closest('tr');
      if (tr) { v.currentTime = +tr.dataset.s + 0.01; v.play(); }
    });
    pick(0);
  }

  async function pick(i) {
    const j = jobs[i];
    root.querySelectorAll('.va-pick button').forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
    const v = $('#va-video');
    v.src = `${SRC}outputs/${encodeURIComponent(j.clip)}_overlay.mp4`;
    cur = { job: j, turns: [] };
    const sum = await fetch(`${SRC}data/poses/${encodeURIComponent(j.clip)}_summary.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const grade = await fetch(`${SRC}data/poses/${encodeURIComponent(j.clip)}_grade.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (cur.job !== j) return;
    const turns = sum?.turns || [];
    const total = (sum && sum.frames / sum.fps) || j.video_s || 1;
    cur.turns = turns;
    const side = (t) => (t.dancer === j.first ? 'red' : 'blue');
    $('#va-bar').innerHTML = turns.map((t) => `<span class="${side(t)}" style="left:${(t.start_s / total) * 100}%;width:${((t.end_s - t.start_s) / total) * 100}%"></span>`).join('') + '<i class="va-head"></i>';
    $('#va-turns').innerHTML = turns.map((t, k) => `<tr data-s="${t.start_s}" data-k="${k}"><td><span class="va-dot ${side(t)}"></span>${esc(t.dancer)}</td><td>${fmt(t.start_s)} – ${fmt(t.end_s)}</td><td>${Math.round(t.end_s - t.start_s)}s</td></tr>`).join('');
    const nums = [
      [fmt(total), 'Length'],
      [turns.length, 'Rounds'],
      j.skeleton_pct != null && [`${j.skeleton_pct}%`, 'Frames tracked'],
      grade?.music?.bpm && [Math.round(grade.music.bpm), 'BPM'],
    ].filter(Boolean);
    $('#va-nums').innerHTML = nums.map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
    $('#va-links').innerHTML = `${esc(j.title)} · <a href="${esc(j.url)}${j.start ? `&t=${j.start}s` : ''}" target="_blank" rel="noopener">YouTube</a>`;
    tick();
  }

  function tick() {
    const v = $('#va-video'), head = root.querySelector('.va-head');
    if (!v || !head) return;
    const t = v.currentTime, d = v.duration || 1;
    head.style.left = `${(t / d) * 100}%`;
    const k = cur?.turns.findIndex((x) => t >= x.start_s && t < x.end_s);
    root.querySelectorAll('#va-turns tr').forEach((tr) => tr.classList.toggle('on', +tr.dataset.k === k));
  }

  // load only when the tab is first opened, so other tabs never pay for it
  const check = () => { if (document.body.dataset.tab === 'video') load(); else $('#va-video')?.pause(); };
  addEventListener('hashchange', check);
  check();
})();
