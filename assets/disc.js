/* Interactive hero record. Grab the orbiting body and push it round: it launches fresh spiral density
   waves that travel out to the edge of the disc and in to the label (the horizon), where they are absorbed.

   Same model and numbers as tools/spiral_wake.py (Kerr, a = 0.7, body at r = 12M, disc aspect ratio 0.25).
   The wake seen on each groove is the disturbance the body emitted one travel time earlier, carried round
   by the disc since then. In steady orbit this is exactly the rigidly rotating static picture; when the body
   is sped up, slowed or reversed, the change spreads out groove by groove. Travel times are compressed so
   the waves cross the record in a couple of seconds. Without JavaScript the static SVG is shown instead. */
(() => {
  'use strict';
  const fig = document.querySelector('.record');
  const img = fig && fig.querySelector('img.disc');
  if (!img || !document.createElement('canvas').getContext) return;

  const TAU = 2 * Math.PI;
  const MAROON = '#5e1120', CREAM = '#f1e4d6', INK = '#1a1013';
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- wake model (as in tools/spiral_wake.py) ----
  const a = 0.7, rp = 12, h = 0.25, risco = 3.393, N = 24, AMP = 3.8, CREST = 0.25;
  const Om = r => 1 / (Math.pow(r, 1.5) + a);
  const Delta = r => r * r - 2 * r + a * a;
  const P = 0.62, q0 = Math.pow(risco + 0.6, P), q1 = Math.pow(45, P);
  const scale = r => 70 + 400 * (Math.pow(r, P) - q0) / (q1 - q0);
  const n = 6000, r0 = risco, dr = (46 - risco) / (n - 1), I = new Float64Array(n);
  const f = r => (Om(r) - Om(rp)) / (h * r * Om(r)) * r / Math.sqrt(Delta(r));
  for (let k = 1; k < n; k++) I[k] = I[k - 1] + 0.5 * (f(r0 + k * dr) + f(r0 + (k - 1) * dr)) * dr;
  const Ip = I[Math.round((rp - r0) / dr)];
  const wakePhi = r => {
    const x = (r - r0) / dr, k = Math.min(n - 2, Math.max(0, Math.floor(x))), u = x - k;
    return -Math.sign(r - rp) * (I[k] + u * (I[k + 1] - I[k]) - Ip);
  };
  const amp = r => {
    const x = Math.abs(r - rp) / (h * rp);
    return (x < 1 ? 0.4 + 0.6 * x : 1) * Math.pow(1 + x, -0.35);
  };

  const W0 = still ? 0 : TAU / 90;        // display orbital rate of the body: one turn in 90 s (clockwise)
  const SPEED = 220;                      // wave travel speed across the record, in units of a 1000-wide disc per second
  const RP = scale(rp), RLABEL = 62, DISP = AMP * 400 / N;
  const Rb = [], PW = [], A = [], SG = [], TT = [], D = [];
  for (let i = 0; i < N; i++) {
    const r = Math.pow(q0 + (q1 - q0) * i / (N - 1), 1 / P);
    Rb[i] = scale(r); PW[i] = wakePhi(r); A[i] = amp(r);
    SG[i] = 0.10 + 0.5 * h * Math.sqrt(1 + Math.abs(r - rp) / rp);
    TT[i] = Math.abs(Rb[i] - RP) / SPEED;
    D[i] = PW[i] - W0 * TT[i];             // drift picked up while the wave travels: steady orbit gives back PW
  }
  const T_LABEL = (RP - RLABEL) / SPEED, T_MAX = Math.max(...TT, T_LABEL) + 0.5;
  const M = 480, COS = new Float64Array(M), SIN = new Float64Array(M);
  for (let j = 0; j < M; j++) { COS[j] = Math.cos(TAU * j / M); SIN[j] = Math.sin(TAU * j / M); }

  // ---- DOM ----
  const wrap = document.createElement('div');
  wrap.className = 'disc-wrap';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', img.alt);
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'disc-body';
  handle.setAttribute('aria-label', 'Orbiting body. Drag it, or press the arrow keys, to launch new spiral waves.');
  wrap.append(canvas, handle);
  img.replaceWith(wrap);
  const ctx = canvas.getContext('2d');
  const cache = document.createElement('canvas'), cctx = cache.getContext('2d');

  // ---- state ----
  let psi = 0, omega = -W0, clock = 0, s = 0, tPrev = 0, raf = 0, visible = true, hover = false, drag = null;
  let px = 1, cssW = 0;
  let hT = [], hP = [], hS = [];
  const arm = new Float64Array(N), sI = new Float64Array(N);
  let absorb = 0;

  function resetHistory(t) {
    hT = []; hP = []; hS = [];
    for (let k = 40; k >= 0; k--) { const tk = t - T_MAX * k / 40; hT.push(tk); hP.push(psi - W0 * (tk - t)); hS.push(0); }
  }
  function look(tq, out) {          // body angle and wave strength at an earlier time
    const L = hT.length;
    if (tq <= hT[0]) { out[0] = hP[0] - W0 * (tq - hT[0]); out[1] = 0; return; }
    if (tq >= hT[L - 1]) { out[0] = hP[L - 1]; out[1] = hS[L - 1]; return; }
    let lo = 0, hi = L - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (hT[mid] <= tq) lo = mid; else hi = mid; }
    const u = (tq - hT[lo]) / (hT[hi] - hT[lo]);
    out[0] = hP[lo] + u * (hP[hi] - hP[lo]); out[1] = hS[lo] + u * (hS[hi] - hS[lo]);
  }

  // ---- drawing (1000 x 1000 coordinates, as the SVG) ----
  function ring(c, i, ang, si) {
    const am = A[i] * (1 + 0.35 * si), sg = SG[i] * (1 + 0.2 * si), R0 = Rb[i], cut = 6 * sg;
    c.beginPath();
    for (let j = 0; j < M; j++) {
      let d = TAU * j / M - ang; d -= TAU * Math.round(d / TAU);
      const R = R0 + (Math.abs(d) < cut ? DISP * am * Math.exp(-0.5 * (d / sg) * (d / sg)) : 0);
      if (j) c.lineTo(500 + R * COS[j], 500 - R * SIN[j]); else c.moveTo(500 + R, 500);
    }
    c.closePath();
    c.fillStyle = MAROON; c.fill();
    c.lineWidth = 1.6; c.strokeStyle = CREAM; c.stroke();
    if (am <= CREST) return;
    // the crest of the wake on this groove, drawn heavier so the arms read as spirals
    const dm = sg * Math.sqrt(2 * Math.log(am / CREST)), steps = Math.max(4, Math.ceil(dm / 0.006));
    c.beginPath();
    for (let m = -steps; m <= steps; m++) {
      const d = dm * m / steps, R = R0 + DISP * am * Math.exp(-0.5 * (d / sg) * (d / sg));
      const x = 500 + R * Math.cos(ang + d), y = 500 - R * Math.sin(ang + d);
      if (m === -steps) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.lineWidth = 5.2 * (1 + 0.35 * si); c.lineCap = 'round'; c.lineJoin = 'round';
    c.stroke();
  }
  function fitText(str, y, size, len) {
    ctx.font = '800 ' + size + 'px "Big Shoulders Display", "Arial Narrow", sans-serif';
    const w = ctx.measureText(str).width || len;
    ctx.save(); ctx.translate(0, y); ctx.scale(len / w, 1); ctx.fillText(str, 0, 0); ctx.restore();
  }
  function label() {
    const k = px * cssW / 1000;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.translate(500, 500); ctx.rotate(-clock);
    ctx.beginPath(); ctx.arc(0, 0, RLABEL, 0, TAU); ctx.fillStyle = CREAM; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 56, 0, TAU); ctx.lineWidth = 1 + 2.5 * absorb; ctx.strokeStyle = MAROON; ctx.stroke();   // thickens as a wave is absorbed
    ctx.fillStyle = MAROON; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    fitText('SPIRAL DENSITY WAVES', -19, 11, 78);
    fitText('KERR, a = 0.7', 31, 10, 50);
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fillStyle = INK; ctx.fill();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const bx = 500 + RP * Math.cos(psi), by = 500 - RP * Math.sin(psi);
    ctx.beginPath(); ctx.arc(bx, by, drag || hover ? 13.5 : 11, 0, TAU);
    ctx.fillStyle = MAROON; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = CREAM; ctx.stroke();
    handle.style.transform = 'translate(' + (bx * cssW / 1000).toFixed(1) + 'px,' + (by * cssW / 1000).toFixed(1) + 'px)';
  }
  function buildCache() {
    const k = px * cssW / 1000;
    cache.width = cache.height = canvas.width;
    cctx.setTransform(k, 0, 0, k, 0, 0);
    for (let i = N - 1; i >= 0; i--) ring(cctx, i, PW[i], 0);   // outer first, so each bump occludes the groove beyond it
  }
  function draw(quiet) {
    const Wd = canvas.width, k = Wd / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, Wd, Wd);
    if (quiet) {                       // steady orbit: the whole pattern turns rigidly with the body
      ctx.translate(Wd / 2, Wd / 2); ctx.rotate(-psi); ctx.drawImage(cache, -Wd / 2, -Wd / 2);
    } else {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      for (let i = N - 1; i >= 0; i--) ring(ctx, i, arm[i], sI[i]);
    }
    label();
  }

  // ---- time stepping ----
  const tmp = [0, 0];
  function frame(now) {
    raf = 0;
    const t = now / 1000, dt = Math.min(0.05, Math.max(0, t - tPrev));
    tPrev = t;
    if (drag) {
      const w = dt > 0 ? (drag.target - psi) / dt : 0;
      psi = drag.target;
      omega += (w - omega) * (1 - Math.exp(-dt / 0.06));
    } else {
      omega = Math.max(-9, Math.min(9, omega));
      omega += (-W0 - omega) * (1 - Math.exp(-dt / 2.2));   // let go: the body settles back onto its orbit
      psi += omega * dt;
    }
    const sRaw = Math.min(1, Math.max(0, (Math.abs(omega) - W0) / Math.PI));   // full strength at half a turn per second
    s += (sRaw - s) * (1 - Math.exp(-dt / 0.05));
    const beat = 0.5 + 0.5 * Math.cos(3 * psi);              // the extra waves come off in trains, three per lap
    clock -= W0 * dt;
    hT.push(t); hP.push(psi); hS.push(s * (0.2 + 0.8 * beat * beat));
    let cut = 0;
    while (cut < hT.length - 2 && hT[cut + 1] < t - T_MAX) cut++;
    if (cut) { hT.splice(0, cut); hP.splice(0, cut); hS.splice(0, cut); }

    let quiet = !drag && s < 1e-3 && Math.abs(omega + W0) < 2e-4;
    for (let i = 0; i < N; i++) {
      look(t - TT[i], tmp);
      arm[i] = tmp[0] + D[i]; sI[i] = tmp[1];
      if (tmp[1] > 2e-3 || Math.abs(arm[i] - psi - PW[i]) > 2e-3) quiet = false;
    }
    look(t - T_LABEL, tmp); absorb = tmp[1];
    if (absorb > 2e-3) quiet = false;
    if (quiet) { omega = -W0; s = 0; }
    draw(quiet);
    if (visible && !(quiet && W0 === 0)) raf = requestAnimationFrame(frame);
  }
  function start() {
    if (raf || !visible) return;
    const t = performance.now() / 1000;
    if (t - tPrev > 0.25) resetHistory(t);   // coming back after a pause
    tPrev = t;
    raf = requestAnimationFrame(frame);
  }

  // ---- size ----
  function resize() {
    const w = wrap.getBoundingClientRect().width;
    if (!w) return;
    cssW = w; px = Math.min(2, window.devicePixelRatio || 1);
    const Wd = Math.round(w * px);
    if (canvas.width !== Wd) { canvas.width = canvas.height = Wd; buildCache(); }
    draw(!raf && W0 === 0);
    start();
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(wrap); else addEventListener('resize', resize);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => {
      visible = es[es.length - 1].isIntersecting;
      if (visible) start(); else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }).observe(wrap);
  }
  if (document.fonts && document.fonts.load) document.fonts.load('800 11px "Big Shoulders Display"').then(() => { if (!raf) draw(true); });
  resetHistory(performance.now() / 1000);
  resize();

  // ---- interaction ----
  const angleAt = e => {
    const b = wrap.getBoundingClientRect();
    return Math.atan2(-((e.clientY - b.top) / b.height - 0.5), (e.clientX - b.left) / b.width - 0.5);
  };
  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    drag = { last: angleAt(e), target: psi };
    document.documentElement.classList.add('disc-dragging');
    start();
  });
  handle.addEventListener('pointermove', e => {
    if (!drag) return;
    const an = angleAt(e);
    let d = an - drag.last; d -= TAU * Math.round(d / TAU);
    drag.last = an; drag.target += d;
  });
  const release = () => { if (!drag) return; drag = null; document.documentElement.classList.remove('disc-dragging'); start(); };
  handle.addEventListener('pointerup', release);
  handle.addEventListener('pointercancel', release);
  handle.addEventListener('lostpointercapture', release);
  handle.addEventListener('pointerenter', () => { hover = true; if (!raf) draw(false); start(); });
  handle.addEventListener('pointerleave', () => { hover = false; start(); });
  handle.addEventListener('keydown', e => {
    const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Enter: 1, ' ': 1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    omega = -W0 - dir * TAU * 0.6;    // a push along the orbit (clockwise is forwards)
    start();
  });
})();
