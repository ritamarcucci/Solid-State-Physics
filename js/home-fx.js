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

  /* ---- copertine animate dei due moduli (canvas 2D) ----
     "cryst": reticolo CFC che ruota + fascio X + spot di diffrazione
     "bands": bande E(k) con gap, elettroni che scorrono, fotone che li eccita */
  const lattice = buildFCC(2);
  function glow(ctx, x, y, r, rgb, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  const ART = {
    cryst(ctx, w, h, t, hot) {
      const cx = w * .42, cy = h * .5, sc = Math.min(w * .5, h) * .27;
      const ay = t * (.5 + .9 * hot), ax = .5;
      const cA = Math.cos(ay), sA = Math.sin(ay), cX = Math.cos(ax), sX = Math.sin(ax), f = 4;
      // fascio X in ingresso (ambra) con fotoni che corrono
      const gb = ctx.createLinearGradient(0, 0, cx, 0);
      gb.addColorStop(0, 'rgba(255,181,71,0)'); gb.addColorStop(1, 'rgba(255,181,71,.85)');
      ctx.strokeStyle = gb; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(cx, cy); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const u = ((t * (.35 + .4 * hot) + i / 6) % 1);
        glow(ctx, u * cx, cy, 9, '255,220,140', .9 * u);
      }
      // raggi diffratti e spot
      const rays = [[-.34, 0], [0, 1.6], [.30, 3.1], [-.62, 4.4], [.58, 5.2]];
      rays.forEach(([ang, ph], i) => {
        const L = w * .94 - cx, ex = cx + L * Math.cos(ang), ey = cy + L * Math.sin(ang) * (h / w) * 1.7;
        const I = .35 + .65 * Math.pow(.5 + .5 * Math.sin(t * (1.4 + hot) + ph), 2);
        const gr = ctx.createLinearGradient(cx, cy, ex, ey);
        gr.addColorStop(0, `rgba(255,243,122,${.05 + .25 * I})`); gr.addColorStop(1, `rgba(255,243,122,${.5 * I})`);
        ctx.strokeStyle = gr; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
        glow(ctx, ex, ey, 22 + 10 * I, '255,243,122', .85 * I);
        ctx.fillStyle = `rgba(255,255,230,${.4 + .6 * I})`; ctx.beginPath(); ctx.arc(ex, ey, 3.2, 0, 7); ctx.fill();
      });
      // reticolo
      const Q = lattice.P.map(p => {
        const X = p[0] * cA + p[2] * sA; let Z = -p[0] * sA + p[2] * cA;
        const Y = p[1] * cX - Z * sX; Z = p[1] * sX + Z * cX;
        const k = f / (f + Z); return [cx + X * sc * k, cy + Y * sc * k, Z, k];
      });
      ctx.lineWidth = 1.2;
      for (const [a, b] of lattice.B) {
        const A = Q[a], B = Q[b], al = Math.max(.05, .1 + .4 * ((A[3] + B[3]) / 2 - .72));
        ctx.strokeStyle = `rgba(79,209,197,${al})`; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      }
      Q.map((q, i) => [q, i]).sort((a, b) => b[0][2] - a[0][2]).forEach(([q, i]) => {
        const hotAtom = i % 11 === 0, r = (hotAtom ? 6.5 : 4.2) * q[3], al = Math.min(1, .3 + .9 * (q[3] - .62));
        if (hotAtom) glow(ctx, q[0], q[1], r * 5, '255,181,71', .6);
        else glow(ctx, q[0], q[1], r * 3, '79,209,197', .25 * al);
        ctx.fillStyle = hotAtom ? `rgba(255,200,110,${al})` : `rgba(160,240,230,${al})`;
        ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fill();
      });
    },
    bands(ctx, w, h, t, hot) {
      const pad = { l: 26, r: 26, t: 26, b: 44 }, W = w - pad.l - pad.r, H = h - pad.t - pad.b, V = .55, Emax = 4.5;
      const X = k => pad.l + (k + 1) / 2 * W, Y = e => pad.t + H - e / Emax * H;
      const E = (k, s) => {                       // due bande a elettrone quasi libero, zona ridotta k∈[-1,1]
        const a = Math.abs(k), e1 = a * a, e2 = (a - 2) * (a - 2), m = (e1 + e2) / 2, d = (e1 - e2) / 2;
        return m + s * Math.sqrt(d * d + V * V);
      };
      const path = s => { ctx.beginPath(); for (let i = 0; i <= 160; i++) { const k = -1 + i / 80, x = X(k), y = Y(E(k, s)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } };
      // gap
      const gLo = E(1, -1), gHi = E(1, 1), sh = .5 + .5 * Math.sin(t * 1.6);
      const gg = ctx.createLinearGradient(0, Y(gHi), 0, Y(gLo));
      gg.addColorStop(0, `rgba(255,181,71,${.10 + .08 * sh})`); gg.addColorStop(.5, `rgba(255,181,71,${.04})`); gg.addColorStop(1, `rgba(255,181,71,${.10 + .08 * sh})`);
      ctx.fillStyle = gg; ctx.fillRect(pad.l, Y(gHi), W, Y(gLo) - Y(gHi));
      ctx.strokeStyle = 'rgba(255,181,71,.55)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(pad.l, Y((gLo + gHi) / 2)); ctx.lineTo(w - pad.r, Y((gLo + gHi) / 2)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,208,138,.85)'; ctx.font = '600 11px JetBrains Mono, monospace'; ctx.fillText('E_F', w - pad.r - 24, Y((gLo + gHi) / 2) - 6);
      // parabola libera
      ctx.strokeStyle = 'rgba(154,167,196,.28)'; ctx.setLineDash([3, 5]); ctx.lineWidth = 1;
      ctx.beginPath(); for (let i = 0; i <= 120; i++) { const k = -1.2 + i / 50, e = k * k; if (e > Emax) continue; const x = X(k), y = Y(e); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); ctx.setLineDash([]);
      // bande con bagliore
      [[-1, '79,209,197'], [1, '157,140,255']].forEach(([s, rgb]) => {
        ctx.save(); ctx.strokeStyle = `rgba(${rgb},.35)`; ctx.lineWidth = 9; ctx.filter = 'blur(6px)'; path(s); ctx.stroke(); ctx.restore();
        ctx.strokeStyle = `rgb(${rgb})`; ctx.lineWidth = 2.8; path(s); ctx.stroke();
      });
      // elettroni che scorrono sulla banda di valenza
      for (let i = 0; i < 12; i++) {
        const k = (((i / 12 + t * (.06 + .1 * hot)) % 1) * 2 - 1) * .96;
        glow(ctx, X(k), Y(E(k, -1)), 11, '120,240,230', .55);
        ctx.fillStyle = '#d6fffa'; ctx.beginPath(); ctx.arc(X(k), Y(E(k, -1)), 2.8, 0, 7); ctx.fill();
      }
      // ciclo ottico: fotone → salto dell'elettrone → ricombinazione
      const T = 5.2 / (1 + .6 * hot), ph = (t % T) / T, kx = .82;
      const yLo = Y(E(kx, -1)), yHi = Y(E(kx, 1)), xs = X(kx);
      if (ph < .3) {                              // fotone ondulato che scende
        const u = ph / .3; ctx.strokeStyle = 'rgba(255,224,150,.95)'; ctx.lineWidth = 2.2; ctx.beginPath();
        for (let j = 0; j <= 40; j++) { const yy = 4 + (yLo - 4) * u * j / 40; const xx = xs - 40 * (1 - u) + 6 * Math.sin(j * .9 + t * 12) * (j / 40) ; j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
        ctx.stroke(); glow(ctx, xs - 40 * (1 - u), 4 + (yLo - 4) * u, 14, '255,224,150', .9);
      }
      let ey = null;
      if (ph >= .3 && ph < .42) { const u = (ph - .3) / .12, e = 1 - Math.pow(1 - u, 3); ey = yLo + (yHi - yLo) * e; glow(ctx, xs, yLo, 30 * (1 - u) + 6, '255,240,200', .8 * (1 - u)); }
      else if (ph >= .42 && ph < .8) ey = yHi;
      else if (ph >= .8 && ph < .9) { const u = (ph - .8) / .1; ey = yHi + (yLo - yHi) * u; }
      if (ph >= .9) { const u = (ph - .9) / .1; glow(ctx, xs, yLo, 26 * (1 - u) + 4, '255,181,71', .7 * (1 - u)); }
      if (ey !== null) {
        glow(ctx, xs, ey, 24, '190,175,255', .8);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(xs, ey, 4.2, 0, 7); ctx.fill();
        if (ph >= .3 && ph < .9) {               // la lacuna lasciata nella banda di valenza
          ctx.strokeStyle = 'rgba(255,181,71,.95)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(xs, yLo, 4.4, 0, 7); ctx.stroke();
        }
      }
      // assi
      ctx.strokeStyle = 'rgba(154,167,196,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, h - pad.b); ctx.lineTo(w - pad.r, h - pad.b); ctx.stroke();
      ctx.fillStyle = 'rgba(154,167,196,.7)'; ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText('−π/a', pad.l - 6, h - pad.b + 16); ctx.fillText('Γ', X(0) - 3, h - pad.b + 16); ctx.fillText('π/a', w - pad.r - 24, h - pad.b + 16);
    }
  };
  home.querySelectorAll('.art-canvas').forEach(cv => {
    const draw = ART[cv.dataset.art], card = cv.closest('.module-card');
    const hot = 0;                              // le copertine si muovono da sole: nessuna reazione al mouse
    let ctx = null, w = 0, h = 0, vis = false, t0 = performance.now();
    const fit = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
      if (!r.width) return; w = r.width; h = r.height;
      cv.width = w * dpr; cv.height = h * dpr; ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    new ResizeObserver(fit).observe(cv);
    new IntersectionObserver(es => { vis = es[0].isIntersecting; }).observe(cv);
    const frame = now => {
      requestAnimationFrame(frame);
      if (!vis || home.classList.contains('hidden')) return;
      if (!ctx) { fit(); if (!ctx) return; }
      ctx.clearRect(0, 0, w, h);
      draw(ctx, w, h, reduce ? 2 : (now - t0) / 1000, hot);
    };
    requestAnimationFrame(frame);
  });

  /* ---- pulsante "Esplora i moduli" ---- */
  const btn = $('btn-explore');
  if (btn) btn.addEventListener('click', () => $('home-modules').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }));
})();
