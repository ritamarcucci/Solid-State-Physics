/* =============================================================================
 *  home-fx.js — effetti della Home (design: design/design.md)
 *  Solo decorazione: nessuna dipendenza dal resto dell'app.
 *    - reticolo FCC 3D sul canvas dell'hero (ruota, parallasse al mouse)
 *    - comparsa allo scroll (.reveal), contatori, spotlight sulle card
 *    - pulsante "Esplora i moduli"
 * ============================================================================= */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const home = $('view-home');
  if (!home) return;

  /* ---- reticolo FCC: 2×2×2 celle convenzionali, legami ai primi vicini ---- */
  function buildFCC(n) {
    const P = [];
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) for (let k = 0; k <= n; k++) P.push([i, j, k]);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k <= n; k++) {
      P.push([i + .5, j + .5, k]); P.push([i + .5, k, j + .5]); P.push([k, i + .5, j + .5]);
    }
    P.forEach(p => { p[0] -= n / 2; p[1] -= n / 2; p[2] -= n / 2; });
    const B = [], d = Math.SQRT1_2;
    for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) {
      if (Math.abs(Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1], P[a][2] - P[b][2]) - d) < .02) B.push([a, b]);
    }
    return { P, B };
  }

  const canvas = $('hero-lattice');
  if (canvas) {
    const L = buildFCC(2);
    let w = 0, h = 0, t = 0, mx = 0, my = 0, ctx = null;
    const fit = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect();
      if (!r.width) return;
      w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    addEventListener('resize', fit);
    addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; });

    const frame = () => {
      requestAnimationFrame(frame);
      if (home.classList.contains('hidden')) return;          // risparmia CPU nell'area di lavoro
      if (!ctx || !w) { fit(); if (!ctx) return; }
      ctx.clearRect(0, 0, w, h);
      t += reduce ? 0 : .004;
      const ay = t + mx * .9, ax = .5 + my * .5;
      const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
      const sc = Math.min(w, h) * .22, f = 4;
      const Q = L.P.map(p => {
        const X = p[0] * cy + p[2] * sy;
        let Z = -p[0] * sy + p[2] * cy;
        const Y = p[1] * cx - Z * sx;
        Z = p[1] * sx + Z * cx;
        const k = f / (f + Z);
        return [w / 2 + X * sc * k, h / 2 + Y * sc * k, Z, k];
      });
      ctx.lineWidth = 1;
      for (const [a, b] of L.B) {
        const A = Q[a], B = Q[b];
        const al = Math.max(.03, .04 + .22 * ((A[3] + B[3]) / 2 - .7));
        ctx.strokeStyle = `rgba(79,209,197,${al})`;
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      }
      Q.map((q, i) => [q, i]).sort((a, b) => b[0][2] - a[0][2]).forEach(([q, i]) => {
        const hot = i % 11 === 0, r = (hot ? 5.5 : 3.4) * q[3];
        const al = Math.min(1, .25 + .75 * (q[3] - .6) * 1.8);
        if (hot) {
          const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], r * 5);
          g.addColorStop(0, 'rgba(255,181,71,.55)'); g.addColorStop(1, 'rgba(255,181,71,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], r * 5, 0, 7); ctx.fill();
        }
        ctx.fillStyle = hot ? `rgba(255,181,71,${al})` : `rgba(150,235,225,${al})`;
        ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fill();
      });
    };
    frame();
  }

  /* ---- comparsa allo scroll ---- */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: .15 });
  home.querySelectorAll('.reveal').forEach(el => io.observe(el));

  /* ---- contatori ---- */
  home.querySelectorAll('[data-to]').forEach(el => {
    const to = +el.dataset.to;
    new IntersectionObserver((es, o) => {
      if (!es[0].isIntersecting) return;
      o.disconnect();
      if (reduce) { el.textContent = to; return; }
      const t0 = performance.now();
      (function step(now) {
        const p = Math.min((now - t0) / 1200, 1);
        el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    }).observe(el);
  });

  /* ---- spotlight sulle card ---- */
  home.querySelectorAll('.module-card').forEach(c => c.addEventListener('pointermove', e => {
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }));

  /* ---- pulsante "Esplora i moduli" ---- */
  const btn = $('btn-explore');
  if (btn) btn.addEventListener('click', () => $('home-modules').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }));
})();
