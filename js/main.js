/* =============================================================================
 *  main.js — Navigazione SPA e controller dei sei strumenti
 * =============================================================================
 *  Flusso dei dati per ogni strumento:
 *      controlli (DOM)  →  Physics.*  (numeri)  →  Visuals.* (disegno)
 *  Ogni strumento è inizializzato "pigramente" la prima volta che viene
 *  aperto: la home si carica subito e il WebGL parte solo quando serve.
 *  Routing con hash (#/cryst/lattice) così i link e il tasto "indietro"
 *  del browser funzionano anche su Vercel senza configurazioni server.
 * ============================================================================= */
'use strict';

/* ---------------------------------------------------------------- utilità --- */
const $ = id => document.getElementById(id);
const fmt = (v, d = 3) => Number.isFinite(v) ? v.toFixed(d) : '—';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Collega uno slider: map converte il valore grezzo dell'input nella grandezza
 *  fisica, show la formatta nell'<output> accanto, onChange ricalcola. */
function bindRange(id, map, show, onChange) {
  const el = $(id), out = $(id + '-out');
  const read = () => map(Number(el.value));
  const upd = () => { if (out) out.textContent = show(read()); onChange && onChange(); };
  el.addEventListener('input', upd);
  if (out) out.textContent = show(read());
  return read;
}
function fillSelect(sel, items) {
  sel.innerHTML = items.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
}
/** Render MathJax di un nodo (con attesa del caricamento della libreria). */
function typeset(el, tries = 0) {
  if (window.MathJax && MathJax.typesetPromise) { MathJax.typesetPromise([el]).catch(() => {}); return; }
  if (tries < 40) setTimeout(() => typeset(el, tries + 1), 250);
}
/** Ricalcolo al massimo una volta per frame (slider molto rapidi). */
function rafThrottle(fn) {
  let pending = false;
  return () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; fn(); }); };
}
const M = () => Physics.MATERIALS;

/* =============================================================================
 *  NAVIGAZIONE
 * ============================================================================= */
const MODULES = {
  cryst: {
    eyebrow: 'Modulo 1', title: 'Cristallografia e Diffrattometria',
    tools: [
      { id: 'lattice', label: 'Costruttore di reticoli', desc: 'Fattore di impacchettamento' },
      { id: 'ewald', label: 'Ponte reale ↔ reciproco', desc: 'Sfera di Ewald e Laue' },
      { id: 'powder', label: 'Stanza dei raggi X', desc: 'Polveri, Scherrer, Debye-Waller' }
    ]
  },
  bands: {
    eyebrow: 'Modulo 2', title: 'Bande Cristalline e Modelli',
    tools: [
      { id: 'kp', label: 'Top-down', desc: 'Quasi libero e Kronig-Penney' },
      { id: 'tb', label: 'Bottom-up', desc: 'Tight binding 1D' },
      { id: 'pseudo', label: 'Il trucco del nucleo', desc: 'Pseudopotenziale' }
    ]
  }
};
const state = { module: null, tool: null };
const typesetDone = new Set();

/* -----------------------------------------------------------------------------
 *  Visibilità: un elemento è nascosto se ha la classe .hidden; la vista o il
 *  tool mostrati hanno la classe .active. Le due classi sono sempre
 *  complementari, così basta una funzione per gestirle.
 * --------------------------------------------------------------------------- */
function setVisible(el, visible) {
  el.classList.toggle('active', visible);
  el.classList.toggle('hidden', !visible);
}

/** Mostra una sola vista: 'home' oppure 'work'. */
function showView(name) {
  setVisible($('view-home'), name === 'home');
  setVisible($('view-work'), name === 'work');
  window.scrollTo(0, 0);
}

/** Entra in un modulo: costruisce la sidebar con i suoi tool e apre il tool richiesto. */
function openModule(modKey, toolId) {
  const mod = MODULES[modKey];
  if (!mod) return goHome();
  if (state.module !== modKey) {
    state.module = modKey;
    $('side-eyebrow').textContent = mod.eyebrow;
    $('side-module-title').textContent = mod.title;
    $('side-nav').innerHTML = mod.tools.map((t, i) => `
      <button type="button" class="nav-item" data-tool="${t.id}">
        <span class="num">${i + 1}</span><span><b>${t.label}</b><small>${t.desc}</small></span>
      </button>`).join('');
    $('side-nav').querySelectorAll('.nav-item').forEach(b =>
      b.addEventListener('click', () => { location.hash = `#/${modKey}/${b.dataset.tool}`; }));
  }
  showView('work');
  openTool(mod.tools.some(t => t.id === toolId) ? toolId : mod.tools[0].id);
}

/** Mostra un solo tool. Il tool diventa visibile PRIMA dell'inizializzazione:
 *  Three.js e Chart.js misurano il contenitore e con display:none
 *  leggerebbero dimensioni nulle. */
function openTool(id) {
  const T = Tools[id];
  if (!T) return;
  state.tool = id;
  document.querySelectorAll('.tool').forEach(s => setVisible(s, s.dataset.tool === id));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tool === id));

  if (!T.ready) {
    try {
      T.init();
      T.ready = true;
    } catch (err) {
      console.error(`Errore inizializzando "${id}":`, err);
      const box = document.querySelector(`#tool-${id} .readout`);
      if (box) box.innerHTML = `<span class="hl">Errore nell'inizializzazione dello strumento: ${err.message}</span>`;
      Visuals.setActive([]);
      return;
    }
  }
  Visuals.setActive(T.views ? T.views() : []);
  if (T.onShow) requestAnimationFrame(() => T.onShow());
  if (!typesetDone.has(id)) { typesetDone.add(id); typeset($('tool-' + id)); }
}

function goHome() {
  state.module = null;
  state.tool = null;
  Visuals.setActive([]);                 // ferma il rendering 3D in background
  showView('home');
}

/** Routing a hash: "#/" home, "#/cryst" primo tool del modulo, "#/cryst/powder" tool specifico. */
function route() {
  const [, mod, tool] = (location.hash || '').split('/');
  if (mod && MODULES[mod]) openModule(mod, tool); else goHome();
}

/* =============================================================================
 *  STRUMENTI
 * ============================================================================= */
const Tools = {};

/* -----------------------------------------------------------------------------
 *  1.1 Costruttore di reticoli
 * --------------------------------------------------------------------------- */
Tools.lattice = {
  init() {
    const cubic = Object.entries(M()).filter(([, m]) => ['sc', 'bcc', 'fcc'].includes(m.structure));
    fillSelect($('lat-mat'), cubic.map(([k, m]) => [k, `${m.name} (${k}) — ${m.structure.toUpperCase()}, a = ${m.a} Å`]));
    $('lat-mat').value = 'Cu';
    this.view = new Visuals.LatticeView($('lat-3d'));
    this.structure = null;

    const update = rafThrottle(() => this.update());
    this.readR = bindRange('lat-r', v => v / 1000, () => '', update);
    $('lat-mat').addEventListener('change', () => { $('lat-struct').value = M()[$('lat-mat').value].structure; this.rebuild(); });
    $('lat-struct').addEventListener('change', () => this.rebuild());
    $('lat-clip').addEventListener('change', update);
    $('lat-btn-touch').addEventListener('click', () => this.animateTo(1));
    $('lat-btn-tab').addEventListener('click', () => {
      const mat = M()[$('lat-mat').value];
      this.animateTo(Math.min(1, mat.rMetal / (Physics.STRUCTURES[$('lat-struct').value].touch * mat.a)));
    });
    $('lat-struct').value = 'fcc';
    this.rebuild();
  },
  views() { return [this.view]; },

  /** Animazione dolce dello slider verso la frazione f del raggio di contatto. */
  animateTo(f) {
    const el = $('lat-r'), v0 = Number(el.value), v1 = Math.round(f * 1000), t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / 700), e = 1 - Math.pow(1 - t, 3);
      el.value = Math.round(v0 + (v1 - v0) * e); this.update();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  rebuild() {
    const s = $('lat-struct').value, mat = M()[$('lat-mat').value];
    this.view.setStructure(s);
    $('lat-struct-hint').textContent = s === mat.structure
      ? `Struttura reale del ${mat.name.toLowerCase()}.`
      : `Struttura ipotetica: il ${mat.name.toLowerCase()} reale è ${mat.structure.toUpperCase()}. La costante a resta quella sperimentale.`;
    this.update();
  },

  update() {
    const s = $('lat-struct').value, S = Physics.STRUCTURES[s], mat = M()[$('lat-mat').value];
    const a = mat.a, rTouch = S.touch * a;
    let f = this.readR();
    // "blocco" sul contatto: lo slider non può andare oltre la tangenza (fine corsa);
    // entro lo 0.3% si aggancia esattamente al valore ideale
    const locked = f >= 0.997;
    if (locked) f = 1;
    const r = f * rTouch;
    const P = Physics.packing(s, a, r);
    this.view.setRadius(r / a, locked, $('lat-clip').checked);
    $('lat-r-out').textContent = `${fmt(r, 3)} Å`;

    const badge = $('lat-badge');
    badge.textContent = locked ? `Contatto · APF = ${fmt(P.apfIdeal, 3)} · ${S.dirs}` : `${S.label}`;
    badge.className = 'badge' + (locked ? ' hot' : '');
    $('lat-hud').innerHTML = `APF = <b>${fmt(P.apf, 4)}</b>${locked ? ' <span style="color:var(--accent)">● bloccato</span>' : ''}`;

    const tabDiff = 100 * (mat.rMetal - rTouch) / rTouch;
    $('lat-readout').innerHTML = `
      <div class="row"><span>a (${mat.name})</span><b>${fmt(a, 4)} Å</b></div>
      <div class="row"><span>N atomi / cella</span><b>${P.N}</b></div>
      <div class="row"><span>r attuale</span><b>${fmt(r, 3)} Å</b></div>
      <div class="row"><span>r di contatto</span><b>${fmt(rTouch, 3)} Å</b></div>
      <div class="row"><span>r tabulato (CN 12)</span><b>${fmt(mat.rMetal, 3)} Å</b></div>
      <div class="row"><span>  scarto tab./contatto</span><span>${tabDiff >= 0 ? '+' : ''}${fmt(tabDiff, 1)} %</span></div>
      <hr>
      <div class="row"><span>V cella = a³</span><b>${fmt(P.Vcell, 3)} Å³</b></div>
      <div class="row"><span>V sfere = N·4πr³/3</span><b>${fmt(P.Vatoms, 3)} Å³</b></div>
      <div class="meter"><span style="width:${100 * P.apf / 0.7405}%"></span></div>
      <div class="row"><span>APF</span><b class="${locked ? 'hl' : ''}">${fmt(P.apf, 4)}</b></div>
      <div class="row"><span>APF ideale ${s.toUpperCase()}</span><span>${fmt(P.apfIdeal, 4)}</span></div>
      ${locked ? `<hr><span class="ok">Sfere tangenti lungo ${S.dirs}: evidenziate in giallo.</span>` : ''}`;
  }
};

/* -----------------------------------------------------------------------------
 *  1.2 Ponte spazio reale / reciproco
 * --------------------------------------------------------------------------- */
Tools.ewald = {
  init() {
    const list = Object.entries(M()).filter(([, m]) => ['sc', 'bcc', 'fcc', 'diamond'].includes(m.structure));
    fillSelect($('ew-mat'), list.map(([k, m]) => [k, `${m.name} — ${Physics.STRUCTURES[m.structure].label}, a = ${m.a} Å`]));
    $('ew-mat').value = 'Cu';
    this.v = new Visuals.EwaldViews($('ew-real'), $('ew-recip'), $('ew-det'));
    const update = rafThrottle(() => this.update());
    this.v.onRotate = update;
    this.lmin = bindRange('ew-lmin', v => v / 100, v => `${fmt(v, 2)} Å`, () => this.syncLambda('min'));
    this.lmax = bindRange('ew-lmax', v => v / 100, v => `${fmt(v, 2)} Å`, () => this.syncLambda('max'));
    this.update_ = update;
    $('ew-mat').addEventListener('change', () => this.setMaterial());
    document.querySelectorAll('[data-orient]').forEach(b => b.addEventListener('click', () => {
      const o = b.dataset.orient;
      if (o === 'rand') this.v.randomOrient(); else this.v.orient(o.split(',').map(Number));
    }));
    $('ew-spin').addEventListener('change', e => { this.v.spin = e.target.checked; });
    // ResizeObserver del rivelatore: ridisegna se cambia la dimensione
    new ResizeObserver(update).observe($('ew-det'));
    this.setMaterial();
    // leggermente fuori asse rispetto a [001]: pattern ricco ma riconoscibile
    this.v.orient([0.12, 0.08, 1]);
  },
  views() { return this.v.views; },
  onShow() { this.update(); },
  /** Mantiene λmin < λmax spostando l'altro slider se necessario. */
  syncLambda(which) {
    const a = $('ew-lmin'), b = $('ew-lmax');
    if (Number(a.value) > Number(b.value) - 1) {
      if (which === 'min') b.value = Number(a.value) + 1; else a.value = Number(b.value) - 1;
      $('ew-lmin-out').textContent = `${fmt(this.lmin(), 2)} Å`;
      $('ew-lmax-out').textContent = `${fmt(this.lmax(), 2)} Å`;
    }
    this.update_();
  },
  setMaterial() {
    const mat = M()[$('ew-mat').value];
    this.v.setCrystal(mat.structure, mat.a);
    this.update();
  },
  update() {
    const mat = M()[$('ew-mat').value];
    const lamMin = this.lmin(), lamMax = this.lmax();
    const nodes = Physics.laueNodes({ structure: mat.structure, a: mat.a, mat, R: this.v.rotationMatrix(), lamMin, lamMax });
    this.v.update(nodes, lamMin, lamMax);
    const lit = nodes.filter(n => n.lit);
    const spots = this.v.lastSpots || 0;
    $('ew-badge').textContent = `${lit.length} nodi in condizione di Laue · ${spots} macchie sul rivelatore`;
    $('ew-badge').className = 'badge' + (lit.length ? ' hot' : '');
    const top = lit.slice().sort((p, q) => q.I - p.I).slice(0, 6);
    const ext = nodes.filter(n => n.extinct).length;
    $('ew-readout').innerHTML = `
      <div class="row"><span>|a*| = 2π/a</span><b>${fmt(2 * Math.PI / mat.a, 3)} Å⁻¹</b></div>
      <div class="row"><span>raggi sfere</span><b>${fmt(2 * Math.PI / lamMax, 2)} – ${fmt(2 * Math.PI / lamMin, 2)} Å⁻¹</b></div>
      <div class="row"><span>nodi estinti (|h|,|k|,|l| ≤ 3)</span><span>${ext} / ${nodes.length}</span></div>
      <hr>
      ${top.length ? '<div class="row"><span>hkl</span><span>λ (Å)</span><span>2θ</span></div>' +
        top.map(n => `<div class="row"><b>(${n.h} ${n.k} ${n.l})</b><span>${fmt(n.lambda, 3)}</span><span>${fmt(n.twoTheta, 1)}°</span></div>`).join('')
        : '<span>Nessun nodo tra le due sfere: ruota il cristallo o allarga lo spettro.</span>'}`;
  }
};

/* -----------------------------------------------------------------------------
 *  1.3 Stanza dei raggi X (polveri)
 * --------------------------------------------------------------------------- */
Tools.powder = {
  init() {
    const list = Object.entries(M()).filter(([, m]) => m.cm && m.structure !== 'hcp');
    fillSelect($('pw-mat'), list.map(([k, m]) => [k, `${m.name} (${k}) — ${m.structure.toUpperCase()}`]));
    $('pw-mat').value = 'Cu';
    fillSelect($('pw-lambda'), Physics.WAVELENGTHS.map(w => [w.value, w.label]));
    const update = rafThrottle(() => this.update());
    this.size = bindRange('pw-size', v => 2 * Math.pow(500, v / 1000), v => `${v < 100 ? fmt(v, 1) : fmt(v, 0)} nm`, update);
    this.T = bindRange('pw-T', v => v, v => `${v} K`, update);
    this.strain = bindRange('pw-strain', v => v / 10000, v => `${v >= 0 ? '+' : ''}${fmt(100 * v, 2)} %`, update);
    this.micro = bindRange('pw-micro', v => v / 20000, v => `${fmt(100 * v, 3)} %`, update);
    this.grad = bindRange('pw-grad', v => v / 10000, v => `${fmt(100 * v, 2)} %`, update);
    ['pw-mat', 'pw-struct', 'pw-lambda', 'pw-log'].forEach(id => $(id).addEventListener('change', update));
    this.chart = Visuals.makeChart($('pw-chart'), {
      xTitle: '2θ (gradi)', yTitle: 'Intensità (u.a.)', legend: false,
      x: { min: 15, max: 150 }, y: { min: 0, max: 110 }
    });
    this.update();
  },
  update() {
    const key = $('pw-mat').value, mat = M()[key];
    const st = $('pw-struct').value === 'auto' ? mat.structure : $('pw-struct').value;
    const lambda = Number($('pw-lambda').value);
    const T = this.T(), L = this.size();
    const res = Physics.powderPattern({
      mat, structure: st, a: mat.a, lambda, sizeNm: L, T,
      strain: this.strain(), microstrain: this.micro(), gradient: this.grad()
    });
    const data = Array.from(res.x, (x, i) => ({ x, y: res.y[i] }));
    const log = $('pw-log').checked;
    this.chart.options.scales.y = log
      ? { type: 'logarithmic', min: 0.3, max: 200, title: { display: true, text: 'Intensità (u.a., log)' } }
      : { type: 'linear', min: 0, max: 110, title: { display: true, text: 'Intensità (u.a.)' } };
    this.chart.data.datasets = [Visuals.line(data, Visuals.COLORS.accent, { width: 1.6, fill: 'origin', fillColor: 'rgba(255,181,71,.10)', label: 'I(2θ)' })];
    // etichette (hkl) sui picchi più alti
    const bgAt = tt => res.y[Math.round((tt - 15) / 135 * (res.y.length - 1))];
    this.chart.options.plugins.overlays = {
      labels: res.peaks.filter(p => p.relHeight > (log ? 0.2 : 3)).map(p => ({
        x: p.tt, y: Math.max(bgAt(p.tt), log ? 0.4 : 0), text: `${p.h}${p.k}${p.l}`, color: Visuals.COLORS.text
      }))
    };
    this.chart.update('none');

    // tabella riflessioni
    $('pw-table').innerHTML = '<tr><th>hkl</th><th>2θ (°)</th><th>d (Å)</th><th>m</th><th>|F|²</th><th>e^(−2Bs²)</th><th>I rel.</th></tr>' +
      res.peaks.map(p => `<tr><td>(${p.h}${p.k}${p.l})</td><td>${fmt(p.tt, 2)}</td><td>${fmt(p.d, 4)}</td><td>${p.m}</td><td>${fmt(p.F2, 0)}</td><td>${fmt(p.DW, 3)}</td><td>${fmt(p.Irel, 1)}</td></tr>`).join('');

    // verifica: dalla FWHM del picco più intenso si ricava L con Scherrer
    const best = res.peaks.reduce((a, b) => (b.I > (a?.I ?? -1) ? b : a), null);
    const melted = mat.Tm && T >= mat.Tm;
    const extNote = { sc: 'nessuna estinzione', bcc: 'h+k+l dispari estinti', fcc: 'indici misti estinti', diamond: 'misti e h+k+l=4n+2 estinti' }[st];
    $('pw-badge').textContent = `${mat.name} · ${st.toUpperCase()} · ${extNote}`;
    $('pw-badge').className = 'badge' + (st !== mat.structure ? ' hot' : '');
    $('pw-readout').innerHTML = `
      <div class="row"><span>B(T) Debye-Waller</span><b>${mat.thetaD ? fmt(res.B, 3) + ' Å²' : 'n.d.'}</b></div>
      <div class="row"><span>Θ_D</span><span>${mat.thetaD ? mat.thetaD + ' K' : 'non disponibile'}</span></div>
      <div class="row"><span>⟨u²⟩ = B/8π²</span><span>${mat.thetaD ? fmt(res.B / (8 * Math.PI ** 2), 4) + ' Å²' : '—'}</span></div>
      ${best ? `<hr>
      <div class="row"><span>picco più intenso</span><b>(${best.h}${best.k}${best.l}) @ ${fmt(best.tt, 2)}°</b></div>
      <div class="row"><span>FWHM da Scherrer</span><span>${fmt(best.bSizeDeg, 3)}°</span></div>
      <div class="row"><span>FWHM totale</span><span>${fmt(best.H, 3)}°</span></div>
      <div class="row"><span>L = Kλ/(β cosθ)</span><span>${fmt(0.9 * lambda / (best.bSizeDeg / Physics.CONST.DEG * Math.cos(best.tt / 2 / Physics.CONST.DEG)) / 10, 1)} nm</span></div>` : ''}
      ${melted ? `<hr><span class="hl">T ≥ T_fusione (${mat.Tm} K): un campione reale sarebbe liquido e mostrerebbe solo aloni diffusi.</span>` : ''}
      ${key === 'Fe' && T > 1185 && !melted ? `<hr><span class="hl">Sopra 1185 K il ferro reale passa alla fase γ (FCC).</span>` : ''}
      ${!mat.thetaD ? `<hr><span>Θ_D del Po non è misurata in modo affidabile: effetto termico disattivato.</span>` : ''}
      <hr><span>Dilatazione termica non inclusa: i picchi non si spostano con T.</span>`;
  }
};

/* -----------------------------------------------------------------------------
 *  2.1 Kronig-Penney / elettrone quasi libero
 * --------------------------------------------------------------------------- */
Tools.kp = {
  init() {
    const list = Object.entries(M()).filter(([, m]) => m.valence <= 6).sort((a, b) => a[1].valence - b[1].valence);
    fillSelect($('kp-mat'), list.map(([k, m]) => [k, `${m.name} (${k}) — Z_v = ${m.valence}`]));
    $('kp-mat').value = 'Na';
    const update = rafThrottle(() => this.update());
    this.V0 = bindRange('kp-V0', v => v / 20, v => `${fmt(v, 2)} eV`, update);
    this.a = bindRange('kp-a', v => v / 100, v => `${fmt(v, 2)} Å`, update);
    this.b = bindRange('kp-b', v => v / 100, v => fmt(v, 2), update);
    ['kp-mat', 'kp-free'].forEach(id => $(id).addEventListener('change', update));
    this.chart = Visuals.makeChart($('kp-chart'), { xTitle: 'k (π/a)', yTitle: 'E (eV)', x: { min: -1, max: 1, ticks: { stepSize: 0.5 } } });
    this.pot = Visuals.makeChart($('kp-pot'), { xTitle: 'x (Å)', yTitle: 'V (eV)', legend: false });
    this.update();
  },
  update() {
    const V0 = this.V0(), a = this.a(), bf = this.b(), mat = M()[$('kp-mat').value];
    const kp = Physics.kpBands({ V0, a, bFrac: bf, nBands: 4 });
    const C = Visuals.COLORS;
    const Etop = kp.bands.length ? kp.bands[kp.bands.length - 1].Emax : kp.Emax;
    const ds = [];
    if ($('kp-free').checked) {
      Physics.freeElectronFolded(a, kp.Vavg, Etop * 1.02).forEach((c, i) =>
        ds.push(Visuals.line(c.map(p => ({ x: p.k, y: p.E })), 'rgba(148,160,187,.45)',
          { width: 1, dash: [5, 4], label: i === 0 ? 'elettrone libero + V̄' : '_', order: 2 })));
    }
    kp.bands.forEach((b, i) => {
      const pos = b.pts.slice().sort((p, q) => p.k - q.k);
      const pts = pos.map(p => ({ x: -p.k, y: p.E })).reverse().concat(pos.map(p => ({ x: p.k, y: p.E })));
      ds.push(Visuals.line(pts, C.series[i % C.series.length], { width: 2.4, label: `banda ${i + 1}` }));
    });
    const F = Physics.kpFermi(kp, mat.valence);
    this.chart.data.datasets = ds;
    this.chart.options.scales.y.min = 0;
    this.chart.options.scales.y.max = Math.ceil(Etop * 1.05);
    this.chart.options.plugins.overlays = {
      yRanges: kp.gaps.filter(g => g.width > 0.02).map((g, i) => ({
        from: g.Elo, to: g.Ehi, color: 'rgba(255,107,129,.10)', label: `gap ${i + 1}: ${fmt(g.width, 2)} eV`, labelColor: C.danger
      })),
      hLines: F ? [{ y: F.EF, color: C.accent, dash: [6, 4], label: `E_F = ${fmt(F.EF, 2)} eV` }] : [],
      vLines: [{ x: 0, color: 'rgba(148,160,187,.25)', dash: [2, 4] }, { x: -0.5, color: 'rgba(255,181,71,.25)', dash: [2, 4] }, { x: 0.5, color: 'rgba(255,181,71,.25)', dash: [2, 4], label: mat.valence % 2 ? 'k_F' : '' }]
    };
    this.chart.update('none');

    // potenziale V(x) su tre celle
    const vp = [];
    for (let c = -1; c <= 1; c++) {
      const x0 = c * a;
      vp.push({ x: x0, y: 0 }, { x: x0 + a - bf * a, y: 0 }, { x: x0 + a - bf * a, y: V0 }, { x: x0 + a, y: V0 }, { x: x0 + a, y: 0 });
    }
    this.pot.data.datasets = [Visuals.line(vp, C['accent-3'], { width: 1.8, fill: 'origin', fillColor: 'rgba(157,140,255,.15)' })];
    this.pot.options.scales.y.min = 0; this.pot.options.scales.y.max = Math.max(1, V0 * 1.2);
    this.pot.options.scales.x.min = -a; this.pot.options.scales.x.max = 2 * a;
    this.pot.update('none');

    // confronto con la teoria perturbativa (elettrone quasi libero):
    // gap n-esimo ≈ 2|V_G|, con V_G = V0·sin(nπb/a)/(nπ) (coeff. di Fourier della barriera)
    const nfe = n => 2 * V0 * Math.abs(Math.sin(n * Math.PI * bf)) / (n * Math.PI);
    const kind = F ? (F.metal ? '<span class="ok">metallo</span>' : '<span class="hl">isolante</span>') : '—';
    $('kp-badge').textContent = V0 === 0 ? 'V₀ = 0 · parabola libera ripiegata' : `${kp.gaps.filter(g => g.width > 0.02).length} gap aperti`;
    $('kp-badge').className = 'badge' + (V0 > 0 ? ' hot' : '');
    $('kp-readout').innerHTML = `
      <div class="row"><span>E libera al bordo zona</span><b>${fmt(Physics.CONST.HBAR2_2M * (Math.PI / a) ** 2, 3)} eV</b></div>
      <div class="row"><span>V̄ = V₀·b/a</span><span>${fmt(kp.Vavg, 3)} eV</span></div>
      <hr>
      <div class="row"><span>gap</span><span>esatto</span><span>NFE 2|V_G|</span></div>
      ${kp.gaps.map((g, i) => `<div class="row"><b>${i + 1} (k=${g.at ? '±π/a' : '0'})</b><span>${fmt(g.width, 3)}</span><span>${fmt(nfe(i + 1), 3)}</span></div>`).join('')}
      <hr>
      <div class="row"><span>${mat.name}: Z_v</span><b>${mat.valence} e⁻/cella</b></div>
      <div class="row"><span>E_F</span><b>${F ? fmt(F.EF, 3) + ' eV' : 'fuori scala'}</b></div>
      <div class="row"><span>carattere (1D)</span><span>${kind}</span></div>`;
  }
};

/* -----------------------------------------------------------------------------
 *  2.2 Tight binding 1D (+ fononi)
 * --------------------------------------------------------------------------- */
Tools.tb = {
  init() {
    const update = rafThrottle(() => this.update());
    this.a = bindRange('tb-a', v => v / 100, v => `${fmt(v, 2)} Å`, update);
    this.eA = bindRange('tb-eA', v => v / 10, v => `${fmt(v, 1)} eV`, update);
    this.eB = bindRange('tb-eB', v => v / 10, v => `${fmt(v, 1)} eV`, update);
    this.K = bindRange('tb-K', v => v, v => `${v} N/m`, update);
    ['tb-o1', 'tb-o2', 'tb-o3', 'tb-pair'].forEach(id => $(id).addEventListener('change', update));
    $('tb-chain').addEventListener('change', () => this.setChain());
    $('tb-kind').addEventListener('change', () => this.setChain());
    this.ek = Visuals.makeChart($('tb-ek'), { xTitle: 'k (π/a)', yTitle: 'E (eV)', x: { min: -1, max: 1, ticks: { stepSize: 0.5 } } });
    this.va = Visuals.makeChart($('tb-va'), { xTitle: 'passo a (Å)', yTitle: 'E (eV)' });
    this.setChain();
  },
  /** Cambia il range dello slider del passo: nella catena biatomica la cella
   *  contiene due atomi, quindi i primi vicini stanno a a/2. */
  setChain() {
    const di = $('tb-chain').value === 'di', ph = $('tb-kind').value === 'ph';
    const s = $('tb-a');
    s.min = di ? 300 : 150; s.max = di ? 1000 : 600;
    s.value = clamp(Number(s.value) * (di !== this.wasDi && this.wasDi !== undefined ? (di ? 2 : 0.5) : 1), Number(s.min), Number(s.max));
    this.wasDi = di;
    $('tb-a-out').textContent = `${fmt(this.a(), 2)} Å`;
    $('tb-eB-wrap').classList.toggle('hidden', !di);
    $('tb-el-ctrls').classList.toggle('hidden', ph);
    $('tb-ph-ctrls').classList.toggle('hidden', !ph);
    $('tb-va-host').classList.toggle('hidden', ph);
    document.querySelector('#tool-tb .chart-row').classList.toggle('single', ph);
    this.update();
  },
  update() {
    const di = $('tb-chain').value === 'di', ph = $('tb-kind').value === 'ph';
    const C = Visuals.COLORS, n = 241;
    const ks = Array.from({ length: n }, (_, i) => -1 + 2 * i / (n - 1));
    const ds = [];

    if (ph) {
      /* ---------------- fononi ---------------- */
      const [M1, M2] = $('tb-pair').value.split(',').map(Number), K = this.K();
      if (di) {
        const br = ks.map(k => Physics.phononDiatomic(k, K, M1, M2));
        ds.push(Visuals.line(ks.map((k, i) => ({ x: k, y: br[i][0] })), C['accent-2'], { width: 2.4, label: 'ramo acustico' }));
        ds.push(Visuals.line(ks.map((k, i) => ({ x: k, y: br[i][1] })), C['accent-3'], { width: 2.4, label: 'ramo ottico' }));
        const eA = Physics.phononDiatomic(1, K, M1, M2), e0 = Physics.phononDiatomic(0, K, M1, M2);
        this.ek.options.plugins.overlays = { yRanges: eA[1] - eA[0] > 0.01 ? [{ from: eA[0], to: eA[1], color: 'rgba(255,107,129,.10)', label: `gap ${fmt(eA[1] - eA[0], 2)} THz`, labelColor: C.danger }] : [] };
        $('tb-readout').innerHTML = `
          <div class="row"><span>M₁, M₂</span><b>${M1}, ${M2} u</b></div>
          <div class="row"><span>acustico max (k=π/a)</span><b>${fmt(eA[0], 3)} THz</b></div>
          <div class="row"><span>ottico min (k=π/a)</span><b>${fmt(eA[1], 3)} THz</b></div>
          <div class="row"><span>ottico max (k=0)</span><b>${fmt(e0[1], 3)} THz</b></div>
          <div class="row"><span>gap</span><span class="hl">${fmt(eA[1] - eA[0], 3)} THz</span></div>
          <hr><span>A k=π/a: ω₋=√(2K/M_max), ω₊=√(2K/M_min). Con masse uguali il gap si chiude.</span>`;
      } else {
        ds.push(Visuals.line(ks.map(k => ({ x: k, y: Physics.phononMono(k, K, M1) })), C['accent-2'], { width: 2.4, label: 'ramo acustico' }));
        this.ek.options.plugins.overlays = {};
        $('tb-readout').innerHTML = `
          <div class="row"><span>M</span><b>${M1} u</b></div>
          <div class="row"><span>ν_max = √(K/M)/π</span><b>${fmt(Physics.phononMono(1, K, M1), 3)} THz</b></div>
          <hr><span>Con un solo atomo per cella esiste solo il ramo acustico: servono 2 atomi per cella per avere un ramo ottico.</span>`;
      }
      this.ek.options.scales.y.title.text = 'ν (THz)';
      this.ek.options.scales.y.min = 0; this.ek.options.scales.y.max = undefined;
      this.ek.data.datasets = ds;
      this.ek.update('none');
      $('tb-badge').textContent = di ? 'Fononi · catena biatomica' : 'Fononi · catena monoatomica';
      $('tb-badge').className = 'badge';
      return;
    }

    /* ---------------- elettroni ---------------- */
    const a = this.a(), eA = this.eA(), eB = this.eB();
    const orders = [$('tb-o1').checked, $('tb-o2').checked, $('tb-o3').checked];
    const onlyFirst = [true, false, false];
    const t = di ? [a / 2, a, 1.5 * a].map(Physics.harrisonT) : [a, 2 * a, 3 * a].map(Physics.harrisonT);
    let Emin = Infinity, Emax = -Infinity;
    const track = E => { Emin = Math.min(Emin, E); Emax = Math.max(Emax, E); return E; };

    if (!di) {
      const Ek = ks.map(k => track(Physics.tbMono(k, a, eA, orders)));
      if (orders[1] || orders[2]) {      // riferimento: solo primi vicini
        ds.push(Visuals.line(ks.map(k => ({ x: k, y: track(Physics.tbMono(k, a, eA, onlyFirst)) })), 'rgba(148,160,187,.55)', { width: 1.2, dash: [5, 4], label: 'solo t₁' }));
      }
      ds.push(Visuals.line(ks.map((k, i) => ({ x: k, y: Ek[i] })), C['accent-2'], { width: 2.6, label: 'E(k)' }));
    } else {
      const Ek = ks.map(k => Physics.tbDiatomic(k, a, eA, eB, orders).map(track));
      if (orders[1] || orders[2]) {
        const E1 = ks.map(k => Physics.tbDiatomic(k, a, eA, eB, onlyFirst).map(track));
        ds.push(Visuals.line(ks.map((k, i) => ({ x: k, y: E1[i][0] })), 'rgba(148,160,187,.55)', { width: 1.2, dash: [5, 4], label: 'solo t₁' }));
        ds.push(Visuals.line(ks.map((k, i) => ({ x: k, y: E1[i][1] })), 'rgba(148,160,187,.55)', { width: 1.2, dash: [5, 4] }));
      }
      ds.push(Visuals.line(ks.map((k, i) => ({ x: k, y: Ek[i][0] })), C['accent-2'], { width: 2.6, label: 'banda inferiore' }));
      ds.push(Visuals.line(ks.map((k, i) => ({ x: k, y: Ek[i][1] })), C['accent-3'], { width: 2.6, label: 'banda superiore' }));
    }
    const pad = Math.max(0.5, 0.08 * (Emax - Emin));
    this.ek.options.scales.y.title.text = 'E (eV)';
    this.ek.options.scales.y.min = Math.floor(Emin - pad); this.ek.options.scales.y.max = Math.ceil(Emax + pad);
    this.ek.options.plugins.overlays = { hLines: [{ y: eA, color: 'rgba(255,181,71,.6)', dash: [3, 4], label: 'ε_A' }].concat(di ? [{ y: eB, color: 'rgba(255,143,163,.6)', dash: [3, 4], label: 'ε_B' }] : []) };
    this.ek.data.datasets = ds;
    this.ek.update('none');

    // bande vs passo reticolare
    const aMin = Number($('tb-a').min) / 100, aMax = Number($('tb-a').max) / 100;
    const bva = Physics.tbBandsVsA({ mode: di ? 'di' : 'mono', eps: eA, epsA: eA, epsB: eB, orders, aMin, aMax });
    const vds = [];
    bva.bands.forEach((b, i) => {
      const col = i ? C['accent-3'] : C['accent-2'];
      const fillCol = i ? 'rgba(157,140,255,.25)' : 'rgba(79,209,197,.25)';
      vds.push(Visuals.line(bva.a.map((x, j) => ({ x, y: b.min[j] })), col, { width: 1.2, label: '_' }));
      vds.push(Visuals.line(bva.a.map((x, j) => ({ x, y: b.max[j] })), col, { width: 1.2, fill: '-1', fillColor: fillCol, label: i ? 'banda sup.' : (di ? 'banda inf.' : 'banda') }));
    });
    let lo = Infinity, hi = -Infinity;
    for (const b of bva.bands) for (let j = 0; j < bva.a.length; j++) { lo = Math.min(lo, b.min[j]); hi = Math.max(hi, b.max[j]); }
    const span = Math.max(eA, eB) - Math.min(eA, eB);
    this.va.options.scales.y.min = Math.max(lo, Math.min(eA, di ? eB : eA) - 12 - span); this.va.options.scales.y.max = Math.min(hi, Math.max(eA, di ? eB : eA) + 12 + span);
    this.va.options.scales.x.min = aMin; this.va.options.scales.x.max = aMax;
    this.va.options.plugins.overlays = { vLines: [{ x: a, color: C.accent, width: 1.5, label: `a = ${fmt(a, 2)} Å` }] };
    this.va.data.datasets = vds;
    this.va.update('none');

    // lettura numerica
    const W = Emax - Emin;
    let gapTxt = '';
    if (di) {
      const e1 = Physics.tbDiatomic(1, a, eA, eB, orders), e0 = Physics.tbDiatomic(0, a, eA, eB, orders);
      const lowTop = Math.max(e1[0], e0[0]), upBot = Math.min(e1[1], e0[1]);
      gapTxt = `<div class="row"><span>gap (bordo zona)</span><b class="hl">${fmt(Math.max(0, upBot - lowTop), 3)} eV</b></div>
        <div class="row"><span>|ε_A − ε_B|</span><span>${fmt(Math.abs(eA - eB), 3)} eV</span></div>`;
    }
    const dists = di ? ['a/2', 'a', '3a/2'] : ['a', '2a', '3a'];
    $('tb-readout').innerHTML = `
      ${t.map((v, i) => `<div class="row"><span>t${i + 1} (d = ${dists[i]})${orders[i] ? '' : ' — off'}</span><b style="${orders[i] ? '' : 'opacity:.4'}">${fmt(v, 3)} eV</b></div>`).join('')}
      <hr>
      <div class="row"><span>estensione totale</span><b>${fmt(W, 3)} eV</b></div>
      ${!di ? `<div class="row"><span>4t₁ (solo primi vicini)</span><span>${fmt(4 * t[0], 3)} eV</span></div>` : gapTxt}
      <hr><span>Hopping di Harrison: |V_ssσ| = 1.40·ħ²/(m d²) = 10.67/d² eV·Å².</span>`;
    $('tb-badge').textContent = `E(k) = ε${orders.map((o, i) => o ? ` − 2t${i + 1}cos(${i ? i + 1 : ''}ka)` : '').join('')}${di ? '  (2×2)' : ''}`;
    $('tb-badge').className = 'badge hot';
  }
};

/* -----------------------------------------------------------------------------
 *  2.3 Pseudopotenziale
 * --------------------------------------------------------------------------- */
Tools.pseudo = {
  init() {
    fillSelect($('ps-atom'), Object.entries(Physics.PSEUDO_ATOMS).map(([k, p]) => [k, p.label]));
    this.t = 0;
    this.chart = Visuals.makeChart($('ps-chart'), {
      xTitle: 'r (Å) — nucleo al centro', yTitle: 'V(r) (eV)', y2Title: 'R(r)  (Å⁻³ᐟ²)',
      x: { min: -5, max: 5 }, y: { min: -60, max: 20 }, y2: { min: -1, max: 1 }
    });
    this.readT = bindRange('ps-t', v => v / 1000, v => `${Math.round(v * 100)} %`, () => { this.t = this.readT(); this.draw(); });
    $('ps-atom').addEventListener('change', () => this.setAtom());
    $('ps-vr').addEventListener('change', () => this.draw());
    $('ps-btn').addEventListener('click', () => this.animate(this.t < 0.5 ? 1 : 0));
    this.setAtom();
  },
  setAtom() {
    this.sys = Physics.pseudoSystem($('ps-atom').value);
    // griglia di visualizzazione simmetrica: ψ(|x|) per mostrare il nucleo al centro
    const n = 801;
    this.xs = Array.from({ length: n }, (_, i) => -5 + 10 * i / (n - 1));
    const s = this.sys;
    this.rr = this.xs.map(x => Math.max(Math.abs(x), 0.004));
    this.psiV = this.rr.map(r => s.interp(s.psi, r));
    this.phiV = this.rr.map(r => s.interp(s.phi, r));
    const amp = Math.max(...this.psiV.map(Math.abs), ...this.phiV.map(Math.abs));
    this.chart.options.scales.y2.min = -1.1 * amp; this.chart.options.scales.y2.max = 1.1 * amp;
    // normalizzazione della combinazione (1−t)ψ + tφ: ‖·‖² = (1−t)² + t² + 2t(1−t)⟨ψ|φ⟩
    let ov = 0; for (let i = 0; i < s.r.length; i++) ov += s.psi[i] * s.phi[i] * s.r[i] ** 2;
    this.ovPP = ov * (s.r[1] - s.r[0]);
    this.draw();
  },
  /** Interpolazione animata: un'unica variabile t ∈ [0,1] guida sia il
   *  potenziale V = V_vero + t·V_R sia la funzione d'onda (1−t)ψ + tφ. */
  animate(target) {
    const t0 = this.t, start = performance.now(), dur = 1800;
    $('ps-btn').textContent = target ? 'Ripristina potenziale vero' : 'Applica pseudopotenziale';
    const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    const step = now => {
      const u = Math.min(1, (now - start) / dur);
      this.t = t0 + (target - t0) * ease(u);
      $('ps-t').value = Math.round(this.t * 1000);
      $('ps-t-out').textContent = `${Math.round(this.t * 100)} %`;
      this.draw();
      if (u < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },
  draw() {
    const s = this.sys, t = this.t, C = Visuals.COLORS;
    const norm = Math.sqrt((1 - t) ** 2 + t * t + 2 * t * (1 - t) * this.ovPP);
    const VT = this.rr.map(r => s.Vtrue(r)), VP = this.rr.map(r => s.Vps(r));
    const V = VT.map((v, i) => v + t * (VP[i] - v));                 // V_vero + t·V_R
    const VR = VT.map((v, i) => t * (VP[i] - v));                    // parte repulsiva
    const W = this.psiV.map((p, i) => ((1 - t) * p + t * this.phiV[i]) / norm);
    const pts = arr => this.xs.map((x, i) => ({ x, y: arr[i] }));
    const ds = [];
    if (t > 0.02) ds.push(Visuals.line(pts(VT), 'rgba(255,181,71,.28)', { width: 1, dash: [4, 4], label: 'V vero', order: 3 }));
    if (t > 0.02) ds.push(Visuals.line(pts(this.psiV), 'rgba(79,209,197,.28)', { width: 1, dash: [3, 3], label: 'ψ vera', yAxisID: 'y2', order: 3 }));
    if ($('ps-vr').checked && t > 0.02) ds.push(Visuals.line(pts(VR), C['accent-3'], { width: 1.5, dash: [6, 3], label: 'V_R (repulsivo)', order: 2 }));
    ds.push(Visuals.line(pts(V), C.accent, { width: 2.4, label: t > 0.98 ? 'V_ps (empty core)' : 'V(r)', fill: 'origin', fillColor: 'rgba(255,181,71,.07)' }));
    ds.push(Visuals.line(pts(W), C['accent-2'], { width: 2.6, label: t > 0.98 ? 'φ pseudo-funzione' : 'ψ funzione d\'onda', yAxisID: 'y2' }));
    this.chart.data.datasets = ds;
    this.chart.options.plugins.overlays = {
      xRanges: [{ from: -s.rc, to: s.rc, color: 'rgba(157,140,255,.08)' }],
      vLines: [{ x: -s.rc, color: 'rgba(157,140,255,.6)', dash: [3, 3] }, { x: s.rc, color: 'rgba(157,140,255,.6)', dash: [3, 3], label: `r_c = ${fmt(s.rc, 2)} Å` }],
      hLines: [{ y: 0, color: 'rgba(148,160,187,.35)', width: 1 }]
    };
    this.chart.update('none');

    // nodi della curva attuale (r > 0.02 Å)
    let nodes = 0;
    for (let i = this.xs.length >> 1; i < this.xs.length - 1; i++) if (this.rr[i] > 0.02 && W[i] * W[i + 1] < 0) nodes++;
    const P = s.P;
    $('ps-badge').textContent = t < 0.02 ? 'Potenziale vero · ψ con nodi' : t > 0.98 ? 'Pseudopotenziale · φ senza nodi' : `Trasformazione ${Math.round(t * 100)} %`;
    $('ps-badge').className = 'badge' + (t > 0.98 ? ' good' : t > 0.02 ? ' hot' : '');
    $('ps-readout').innerHTML = `
      <div class="row"><span>Z nucleo / Z valenza</span><b>${P.Z} / ${P.Zv}</b></div>
      <div class="row"><span>r_c (Ashcroft)</span><b>${P.rcBohr} a₀ = ${fmt(s.rc, 3)} Å</b></div>
      <div class="row"><span>Z_eff Slater 1s, 2s, 3s</span><span>${P.core.join(', ')}, ${P.val}</span></div>
      <div class="row"><span>⟨1s|φ⟩, ⟨2s|φ⟩</span><span>${fmt(s.overlap[0], 3)}, ${fmt(s.overlap[1], 3)}</span></div>
      <hr>
      <div class="row"><span>nodi radiali (curva attuale)</span><b class="${nodes ? 'hl' : 'ok'}">${nodes}</b></div>
      <div class="row"><span>V(r_c) vero</span><span>${fmt(s.Vtrue(s.rc), 1)} eV</span></div>
      <div class="row"><span>ψ vs φ a r = 2 Å</span><span>${fmt(s.interp(s.psi, 2), 3)} / ${fmt(s.interp(s.phi, 2), 3)}</span></div>
      <hr><span>Fuori dal core le due funzioni quasi coincidono: è lì che avvengono legame e conduzione.</span>`;
  }
};

/* =============================================================================
 *  AVVIO
 *  Gli script con "defer" sono eseguiti in ordine prima di DOMContentLoaded,
 *  quindi qui THREE, Chart, Physics e Visuals sono già definiti (se caricati).
 * ============================================================================= */
document.addEventListener('DOMContentLoaded', () => {
  window.__appStarted = true;
  // la navigazione funziona sempre, anche se una libreria grafica manca
  document.querySelectorAll('.module-card').forEach(c =>
    c.addEventListener('click', () => { location.hash = `#/${c.dataset.module}`; }));
  $('btn-home').addEventListener('click', () => { location.hash = '#/'; });
  window.addEventListener('hashchange', route);

  const missing = [];
  if (typeof THREE === 'undefined') missing.push('Three.js');
  else if (!THREE.OrbitControls) missing.push('OrbitControls');
  if (typeof Chart === 'undefined') missing.push('Chart.js');
  if (missing.length) {
    window.__loadErrors.push(...missing);
    showView('home');
    return;
  }
  Visuals.loadColors();
  Visuals.initCharts();
  route();
});
