/* =============================================================================
 *  visuals.js — Rendering 3D (Three.js) e 2D (Chart.js / Canvas 2D)
 * =============================================================================
 *  Questo file non contiene fisica: riceve numeri già calcolati da physics.js
 *  (tramite main.js) e li disegna.
 *
 *  - Un unico ciclo requestAnimationFrame rende solo le viste "attive"
 *    (quelle dello strumento visibile): niente GPU sprecata in background.
 *  - Ogni vista 3D osserva il proprio contenitore con ResizeObserver.
 *  - Per Chart.js è registrato un plugin "overlays" che disegna bande di gap,
 *    livello di Fermi, bordi di zona, regione di core, etichette dei picchi.
 * ============================================================================= */
'use strict';

const Visuals = (() => {

  /* Legge i colori dalle variabili CSS: grafica e interfaccia restano coerenti. */
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const COLORS = {};
  function loadColors() {
    for (const k of ['bg', 'panel', 'panel-2', 'line', 'line-2', 'text', 'muted', 'faint', 'accent', 'accent-2', 'accent-3', 'danger', 'ok']) {
      COLORS[k] = cssVar('--' + k);
    }
    // palette per serie multiple (bande 1..n)
    COLORS.series = [COLORS['accent-2'], COLORS['accent-3'], '#ff8fa3', '#7cc7ff', '#c3e88d', COLORS.accent];
  }

  /* --------------------------------------------------------------------------
   *  Ciclo di rendering condiviso
   * ------------------------------------------------------------------------ */
  const active = new Set();
  let looping = false;
  function loop() {
    for (const v of active) v.render();
    requestAnimationFrame(loop);
  }
  function setActive(views) {
    active.clear();
    for (const v of views) { active.add(v); v.resize(); }
    if (!looping) { looping = true; requestAnimationFrame(loop); }
  }

  /* --------------------------------------------------------------------------
   *  Base per le viste Three.js
   * ------------------------------------------------------------------------ */
  class ThreeView {
    constructor(host, { fov = 38, pos = [4, 3, 5], target = [0, 0, 0], orbit = true } = {}) {
      this.host = host;
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.localClippingEnabled = true;    // serve per "taglia le sfere alla cella"
      host.appendChild(this.renderer.domElement);

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 1000);
      this.camera.position.set(...pos);
      if (orbit) {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.target.set(...target);
      } else {
        this.camera.lookAt(new THREE.Vector3(...target));
      }
      // illuminazione: ambiente + due direzionali (chiave e controluce)
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      const key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(5, 8, 6); this.scene.add(key);
      const rim = new THREE.DirectionalLight(0x88aaff, 0.35); rim.position.set(-6, -3, -5); this.scene.add(rim);

      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(host);
      this.resize();
    }
    resize() {
      const w = this.host.clientWidth, h = this.host.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    render() {
      if (this.onFrame) this.onFrame();
      if (this.controls) this.controls.update();
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** Cilindro sottile tra due punti: le linee WebGL hanno spessore fisso 1px,
   *  per evidenziare le direzioni compatte servono veri solidi. */
  function rod(p1, p2, radius, material) {
    const a = new THREE.Vector3(...p1), b = new THREE.Vector3(...p2);
    const len = a.distanceTo(b);
    const geo = new THREE.CylinderGeometry(radius, radius, len, 12, 1, true);
    const m = new THREE.Mesh(geo, material);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  }

  /** Scrive "(h k l)" con la notazione cristallografica: un indice negativo
   *  si indica con una barra sopra la cifra (es. (1̄11) per (−1,1,1)).
   *  La barra è disegnata come segmento: i caratteri combinanti Unicode non
   *  sono resi in modo affidabile su canvas. */
  function drawMiller(ctx, idx, x, y) {
    ctx.save();
    ctx.fillStyle = 'rgba(230,235,245,.85)';
    ctx.strokeStyle = 'rgba(230,235,245,.85)';
    ctx.lineWidth = 1;
    const parts = ['('].concat(idx.map(v => String(Math.abs(Math.round(v))))).concat([')']);
    let cx = x;
    parts.forEach((t, i) => {
      ctx.fillText(t, cx, y);
      const w = ctx.measureText(t).width;
      const v = idx[i - 1];
      if (i >= 1 && i <= 3 && v < 0) {       // barra sopra la cifra
        ctx.beginPath(); ctx.moveTo(cx, y - 9); ctx.lineTo(cx + w, y - 9); ctx.stroke();
      }
      cx += w + (i >= 1 && i < 3 ? 1.5 : 0);
    });
    ctx.restore();
  }

  /* --------------------------------------------------------------------------
   *  1.1 — Cella cubica con sfere ridimensionabili
   *  Coordinate di scena: la cella occupa il cubo [-1,1]³ (lato 2), quindi
   *  un raggio r in Å diventa 2r/a in unità di scena.
   * ------------------------------------------------------------------------ */
  class LatticeView extends ThreeView {
    constructor(host) {
      super(host, { pos: [3.4, 2.5, 4.2] });
      this.controls.minDistance = 2.5; this.controls.maxDistance = 14;
      this.cell = new THREE.Group(); this.scene.add(this.cell);
      this.sphereGeo = new THREE.SphereGeometry(1, 48, 32);
      // piani di taglio: tengono solo ciò che sta dentro il cubo [-1,1]³
      this.clipPlanes = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), 1), new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 1), new THREE.Plane(new THREE.Vector3(0, -1, 0), 1),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), 1), new THREE.Plane(new THREE.Vector3(0, 0, -1), 1)
      ];
      this.mats = {
        corner: new THREE.MeshStandardMaterial({ color: COLORS['accent-2'], roughness: .35, metalness: .15, transparent: true, opacity: .9 }),
        face: new THREE.MeshStandardMaterial({ color: COLORS['accent-3'], roughness: .35, metalness: .15, transparent: true, opacity: .9 }),
        body: new THREE.MeshStandardMaterial({ color: COLORS.accent, roughness: .35, metalness: .15, transparent: true, opacity: .9 })
      };
      this.rodMat = new THREE.MeshBasicMaterial({ color: 0xfff27a });
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)),
        new THREE.LineBasicMaterial({ color: COLORS['line-2'] }));
      this.scene.add(edges);
      this.atoms = []; this.rods = new THREE.Group(); this.scene.add(this.rods);
      this.t = 0;
      this.onFrame = () => {           // leggera "pulsazione" delle direzioni compatte
        this.t += 0.05;
        if (this.rods.visible) this.rodMat.color.setHSL(0.15, 1, 0.6 + 0.12 * Math.sin(this.t));
      };
    }
    setStructure(structure) {
      for (const m of this.atoms) this.cell.remove(m);
      this.atoms = Physics.cellSites(structure).map(s => {
        const m = new THREE.Mesh(this.sphereGeo, this.mats[s.kind]);
        m.position.set(...s.p.map(v => 2 * v - 1));
        this.cell.add(m);
        return m;
      });
      this.rods.clear();
      for (const [p, q] of Physics.closePackedSegments(structure)) {
        this.rods.add(rod(p.map(v => 2 * v - 1), q.map(v => 2 * v - 1), 0.022, this.rodMat));
      }
    }
    setRadius(rOverA, locked, clip) {
      const s = 2 * rOverA;
      for (const m of this.atoms) m.scale.setScalar(Math.max(s, 1e-3));
      for (const mat of Object.values(this.mats)) {
        mat.clippingPlanes = clip ? this.clipPlanes : null;
        mat.opacity = locked ? 0.55 : 0.9;     // a contatto le sfere diventano traslucide per vedere le direzioni
        mat.needsUpdate = true;
      }
      this.rods.visible = locked;
    }
  }

  /* --------------------------------------------------------------------------
   *  1.2 — Spazio reale, spazio reciproco, rivelatore
   * ------------------------------------------------------------------------ */
  class EwaldViews {
    constructor(hostA, hostB, canvasC) {
      this.q = new THREE.Quaternion();
      this.onRotate = null;

      /* ---- A: cristallo nello spazio reale (rotazione con trascinamento) ---- */
      this.A = new ThreeView(hostA, { pos: [2.2, 3.2, 6.2], orbit: false });
      this.crystal = new THREE.Group(); this.A.scene.add(this.crystal);
      // fascio incidente fisso lungo +x (freccia ambra)
      this.A.scene.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-4.2, 0, 0), 2.4,
        new THREE.Color(COLORS.accent).getHex(), 0.35, 0.2));
      this._bindDrag(this.A.renderer.domElement);

      /* ---- B: reticolo reciproco ---- */
      this.B = new ThreeView(hostB, { pos: [-2, 16, 26], target: [-5, 0, 0], fov: 40 });
      this.recip = new THREE.Group(); this.B.scene.add(this.recip);
      this.nodeGeo = new THREE.SphereGeometry(1, 14, 10);
      this.matNode = new THREE.MeshStandardMaterial({ color: 0x6b7799, roughness: .6 });
      this.matLit = new THREE.MeshBasicMaterial({ color: 0xfff27a });
      const origin = new THREE.Mesh(this.nodeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      origin.scale.setScalar(0.28); this.B.scene.add(origin);
      // sfere di Ewald: superficie traslucida + reticolo di meridiani
      const mkSphere = color => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide })));
        g.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 24, 12)),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.16 })));
        this.B.scene.add(g); return g;
      };
      this.sphMin = mkSphere(new THREE.Color(COLORS['accent-2']));   // λmax → sfera piccola
      this.sphMax = mkSphere(new THREE.Color(COLORS['accent-3']));   // λmin → sfera grande
      this.kArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, new THREE.Color(COLORS.accent).getHex());
      this.B.scene.add(this.kArrow);
      // segmenti verso i nodi accesi (vettori k' = k + G) — buffer preallocato
      this.maxLines = 400;
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxLines * 6), 3));
      this.koutLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.35 }));
      this.B.scene.add(this.koutLines);

      /* ---- C: rivelatore ---- */
      this.C = canvasC;
      this.ctx = canvasC.getContext('2d');
      this.detMax2Theta = 55;             // semiapertura angolare del rivelatore [°]
      this.spin = false;
      this.A.onFrame = () => {
        if (this.spin) {
          this.q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.0035));
          this._applyRotation();
        }
      };
    }

    /** Trascinamento: dx ruota attorno all'asse verticale, dy attorno all'asse
     *  orizzontale dello schermo — rotazioni nel riferimento del laboratorio. */
    _bindDrag(el) {
      let last = null;
      el.addEventListener('pointerdown', e => { last = [e.clientX, e.clientY]; el.setPointerCapture(e.pointerId); });
      el.addEventListener('pointermove', e => {
        if (!last) return;
        const dx = e.clientX - last[0], dy = e.clientY - last[1];
        last = [e.clientX, e.clientY];
        const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * 0.008);
        const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0).applyQuaternion(this.A.camera.quaternion), dy * 0.008);
        this.q.premultiply(qy).premultiply(qx);
        this._applyRotation();
      });
      const end = () => { last = null; };
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    }

    /** Orienta il cristallo con la direzione cristallografica dir ∥ fascio (x). */
    orient(dir) {
      const v = new THREE.Vector3(...dir).normalize();
      this.q.setFromUnitVectors(v, new THREE.Vector3(1, 0, 0));
      this._applyRotation();
    }
    randomOrient() {
      const u = [Math.random(), Math.random(), Math.random()];
      this.q.set(Math.sqrt(1 - u[0]) * Math.sin(2 * Math.PI * u[1]), Math.sqrt(1 - u[0]) * Math.cos(2 * Math.PI * u[1]),
        Math.sqrt(u[0]) * Math.sin(2 * Math.PI * u[2]), Math.sqrt(u[0]) * Math.cos(2 * Math.PI * u[2]));
      this._applyRotation();
    }

    /** La stessa rotazione si applica al cristallo (A) e al reticolo reciproco (B):
     *  è il cuore didattico del pannello. */
    _applyRotation() {
      this.crystal.quaternion.copy(this.q);
      this.recip.quaternion.copy(this.q);
      if (this.onRotate) this.onRotate();
    }
    /** Matrice di rotazione 3×3 per righe (Three usa l'ordine column-major). */
    rotationMatrix() {
      const e = new THREE.Matrix4().makeRotationFromQuaternion(this.q).elements;
      return [[e[0], e[4], e[8]], [e[1], e[5], e[9]], [e[2], e[6], e[10]]];
    }

    /** Ricostruisce cristallo e nodi quando cambia il materiale.
     *  Per leggibilità si disegna UNA cella convenzionale (opzionalmente un
     *  blocco 2×2×2) con sfere piccole: raggio = 38% del raggio di contatto,
     *  così vertici, facce, centri e siti tetraedrici restano distinguibili.
     *  Nelle strutture tetraedriche (diamante, blenda) si disegnano i legami. */
    setCrystal(mat, { block = false } = {}) {
      const structure = mat.structure, a = mat.a;
      this.crystal.clear();
      const n = block ? 2 : 1;                   // celle per lato
      const s = block ? 1.25 : 2.2;              // lato di una cella in unità di scena
      const half = n * s / 2;                    // il blocco è centrato nell'origine
      const P = f => [f[0] * s - half, f[1] * s - half, f[2] * s - half];   // frazionarie → scena

      // spigoli: cella/e convenzionali
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
        const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s, s)),
          new THREE.LineBasicMaterial({ color: COLORS['line-2'] }));
        box.position.set(...P([i + 0.5, j + 0.5, k + 0.5]));
        this.crystal.add(box);
      }
      // atomi (siti condivisi tra celle disegnati una sola volta)
      const geo = new THREE.SphereGeometry(1, 24, 16);
      const mats = [
        new THREE.MeshStandardMaterial({ color: COLORS['accent-2'], roughness: .35 }),
        new THREE.MeshStandardMaterial({ color: COLORS.accent, roughness: .35 })   // anione della blenda
      ];
      const r = 0.38 * Physics.STRUCTURES[structure].touch * s;
      const seen = new Set();
      for (const site of Physics.cellSites(structure)) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
        const f = [site.p[0] + i, site.p[1] + j, site.p[2] + k];
        const key = f.map(v => v.toFixed(3)).join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        const m = new THREE.Mesh(geo, mats[site.species || 0]);
        m.scale.setScalar(r);
        m.position.set(...P(f));
        this.crystal.add(m);
      }
      // legami tetraedrici
      if (structure === 'diamond' || structure === 'zincblende') {
        const bondMat = new THREE.MeshStandardMaterial({ color: 0xc8d0e0, roughness: .5 });
        for (const [p1, p2] of Physics.closePackedSegments(structure)) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
          const o = [i, j, k];
          this.crystal.add(rod(P(p1.map((v, q) => v + o[q])), P(p2.map((v, q) => v + o[q])), 0.12 * r, bondMat));
        }
      }
      // assi cristallografici a, b, c dall'angolo della cella
      const axCol = [0xff6b81, 0x5ee08f, 0x7cc7ff];
      for (let i = 0; i < 3; i++) {
        const d = [0, 0, 0]; d[i] = 1;
        this.crystal.add(new THREE.ArrowHelper(new THREE.Vector3(...d), new THREE.Vector3(...P([0, 0, 0])), n * s + 0.7, axCol[i], 0.22, 0.12));
      }

      // nodi del reticolo reciproco in coordinate del cristallo (G0);
      // i nodi estinti dal fattore di struttura non si disegnano
      this.recip.clear();
      this.nodeMeshes = new Map();
      this.a = a;
      const g0 = 2 * Math.PI / a, H = 3;
      for (let h = -H; h <= H; h++) for (let k = -H; k <= H; k++) for (let l = -H; l <= H; l++) {
        if (!h && !k && !l) continue;
        if (Physics.isExtinct(mat, structure, h, k, l)) continue;
        const m = new THREE.Mesh(this.nodeGeo, this.matNode);
        m.position.set(g0 * h, g0 * k, g0 * l);
        m.scale.setScalar(0.13);
        this.recip.add(m);
        this.nodeMeshes.set(`${h},${k},${l}`, m);
      }
      // assi reciproci a*, b*, c* (paralleli ad a, b, c nel cubico)
      for (let i = 0; i < 3; i++) {
        const d = [0, 0, 0]; d[i] = 1;
        this.recip.add(new THREE.ArrowHelper(new THREE.Vector3(...d), new THREE.Vector3(), g0, axCol[i], 0.3, 0.15));
      }
    }

    /** Aggiorna sfere, frecce, nodi accesi e rivelatore. */
    update(nodes, lamMin, lamMax) {
      const kMax = 2 * Math.PI / lamMin, kMin = 2 * Math.PI / lamMax;
      // sfera di Ewald: centro in −k û, raggio k (passa per l'origine)
      this.sphMax.scale.setScalar(kMax); this.sphMax.position.set(-kMax, 0, 0);
      this.sphMin.scale.setScalar(kMin); this.sphMin.position.set(-kMin, 0, 0);
      this.kArrow.position.set(-kMax, 0, 0);
      this.kArrow.setLength(kMax, 0.6, 0.3);

      const pos = this.koutLines.geometry.attributes.position.array;
      let nl = 0;
      for (const n of nodes) {
        const m = this.nodeMeshes.get(`${n.h},${n.k},${n.l}`);
        if (!m) continue;
        m.material = n.lit ? this.matLit : this.matNode;
        m.scale.setScalar(n.lit ? 0.26 : 0.13);
        if (n.lit && nl < this.maxLines) {
          // segmento dal centro della sfera della λ che accende il nodo, al nodo
          pos.set([-n.k, 0, 0, n.G[0], n.G[1], n.G[2]], nl * 6); nl++;
        }
      }
      this.koutLines.geometry.setDrawRange(0, nl * 2);
      this.koutLines.geometry.attributes.position.needsUpdate = true;
      this.drawDetector(nodes.filter(n => n.lit));
    }

    /** Rivelatore piano perpendicolare al fascio (geometria in trasmissione).
     *  Macchia in (k'_z/k'_x, −k'_y/k'_x)·D: proiezione centrale del raggio diffratto. */
    drawDetector(lit) {
      const c = this.C, ctx = this.ctx;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) return;
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 8;
      const tanMax = Math.tan(this.detMax2Theta * Math.PI / 180);
      // anelli a 2θ costante (10°, 20°, ...)
      ctx.strokeStyle = 'rgba(148,160,187,.16)'; ctx.fillStyle = 'rgba(148,160,187,.45)';
      ctx.font = '10px JetBrains Mono, monospace'; ctx.lineWidth = 1;
      for (let t = 10; t <= this.detMax2Theta; t += 10) {
        const rr = R * Math.tan(t * Math.PI / 180) / tanMax;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 2 * Math.PI); ctx.stroke();
        ctx.fillText(`${t.toFixed(0)}°`, cx + rr * 0.707 + 2, cy - rr * 0.707 - 2);
      }
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
      // beam stop
      ctx.fillStyle = '#1b2236'; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 2 * Math.PI); ctx.fill();

      // solo i raggi diretti in avanti (k'_x > 0) colpiscono il rivelatore in trasmissione
      const spots = [];
      for (const n of lit) {
        if (!(n.kout && n.kout[0] > 0)) continue;
        const X = n.kout[2] / n.kout[0], Y = -n.kout[1] / n.kout[0];
        if (Math.hypot(X, Y) > tanMax) continue;
        spots.push({ node: n, px: cx + R * X / tanMax, py: cy + R * Y / tanMax });
      }
      this.lastSpots = spots.length;
      if (!spots.length) return;

      const Imax = Math.max(...spots.map(p => p.node.I)) || 1;
      ctx.globalCompositeOperation = 'lighter';
      for (const { node, px, py } of spots) {
        const rel = Math.log10(1 + 9 * node.I / Imax);              // scala logaritmica come una lastra
        const rad = 2.5 + 6 * rel;
        const g = ctx.createRadialGradient(px, py, 0, px, py, rad * 2.2);
        g.addColorStop(0, `rgba(255,250,200,${0.55 + 0.45 * rel})`);
        g.addColorStop(0.35, `rgba(255,220,90,${0.35 * rel + 0.2})`);
        g.addColorStop(1, 'rgba(255,180,60,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, rad * 2.2, 0, 2 * Math.PI); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // Etichette: indici di Miller (h k l) del nodo che ha generato la macchia.
      // Se per qualche motivo gli indici non fossero interi validi, si mostra
      // l'angolo di diffrazione 2θ arrotondato a un decimale (es. "16.0°").
      if (spots.length <= 40) {
        ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
        ctx.textBaseline = 'alphabetic';
        for (const { node, px, py } of spots) {
          const idx = [node.h, node.k, node.l];
          if (idx.every(Number.isInteger)) drawMiller(ctx, idx, px + 8, py - 6);
          else if (Number.isFinite(node.twoTheta)) {
            ctx.fillStyle = 'rgba(230,235,245,.8)';
            ctx.fillText(`${node.twoTheta.toFixed(1)}°`, px + 8, py - 6);
          }
        }
      }
    }
    resize() { this.A.resize(); this.B.resize(); }
    render() { this.A.render(); this.B.render(); }
    get views() { return [this.A, this.B]; }
  }

  /* --------------------------------------------------------------------------
   *  Chart.js: impostazioni globali e plugin "overlays"
   * ------------------------------------------------------------------------ */
  const overlaysPlugin = {
    id: 'overlays',
    beforeDatasetsDraw(chart, args, o) {
      if (!o) return;
      const { ctx, chartArea: ca, scales: { x, y } } = chart;
      ctx.save(); ctx.beginPath(); ctx.rect(ca.left, ca.top, ca.width, ca.height); ctx.clip();
      for (const r of o.yRanges || []) {           // es. gap di energia
        const y1 = y.getPixelForValue(r.from), y2 = y.getPixelForValue(r.to);
        ctx.fillStyle = r.color; ctx.fillRect(ca.left, Math.min(y1, y2), ca.width, Math.abs(y2 - y1));
      }
      for (const r of o.xRanges || []) {           // es. regione di core
        const x1 = x.getPixelForValue(r.from), x2 = x.getPixelForValue(r.to);
        ctx.fillStyle = r.color; ctx.fillRect(Math.min(x1, x2), ca.top, Math.abs(x2 - x1), ca.height);
      }
      ctx.restore();
    },
    afterDatasetsDraw(chart, args, o) {
      if (!o) return;
      const { ctx, chartArea: ca, scales } = chart;
      const x = scales.x, y = scales.y;
      ctx.save();
      ctx.font = '11px JetBrains Mono, monospace';
      for (const l of o.vLines || []) {
        const px = x.getPixelForValue(l.x);
        if (px < ca.left - 1 || px > ca.right + 1) continue;
        ctx.strokeStyle = l.color; ctx.lineWidth = l.width || 1; ctx.setLineDash(l.dash || []);
        ctx.beginPath(); ctx.moveTo(px, ca.top); ctx.lineTo(px, ca.bottom); ctx.stroke();
        if (l.label) { ctx.fillStyle = l.color; ctx.setLineDash([]); ctx.fillText(l.label, px + 4, ca.top + 12); }
      }
      for (const l of o.hLines || []) {
        const py = y.getPixelForValue(l.y);
        if (py < ca.top || py > ca.bottom) continue;
        ctx.strokeStyle = l.color; ctx.lineWidth = l.width || 1.5; ctx.setLineDash(l.dash || []);
        ctx.beginPath(); ctx.moveTo(ca.left, py); ctx.lineTo(ca.right, py); ctx.stroke();
        if (l.label) {
          ctx.setLineDash([]); ctx.fillStyle = l.color;
          const tw = ctx.measureText(l.label).width;
          ctx.fillText(l.label, ca.right - tw - 6, py - 5);
        }
      }
      for (const r of o.yRanges || []) if (r.label) {
        const py = (y.getPixelForValue(r.from) + y.getPixelForValue(r.to)) / 2;
        if (py < ca.top || py > ca.bottom) continue;
        ctx.fillStyle = r.labelColor || COLORS.accent; ctx.fillText(r.label, ca.left + 6, py + 4);
      }
      ctx.textAlign = 'center';
      for (const t of o.labels || []) {
        const px = x.getPixelForValue(t.x), py = y.getPixelForValue(t.y);
        if (px < ca.left || px > ca.right) continue;
        ctx.fillStyle = t.color || COLORS.text;
        ctx.fillText(t.text, px, Math.max(ca.top + 10, py - 8));
      }
      // etichette dei punti ad alta simmetria sotto l'asse x (Γ, X, L, ...)
      ctx.font = '600 13px Inter, system-ui, sans-serif';
      for (const t of o.xTicks || []) {
        const px = x.getPixelForValue(t.x);
        ctx.strokeStyle = 'rgba(148,160,187,.35)'; ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(px, ca.top); ctx.lineTo(px, ca.bottom); ctx.stroke();
        ctx.fillStyle = COLORS.text;
        ctx.fillText(t.label, px, ca.bottom + 18);
      }
      // marcatori (es. massimo di valenza e minimo di conduzione)
      ctx.font = '11px "JetBrains Mono", monospace';
      for (const m of o.markers || []) {
        const px = x.getPixelForValue(m.x), py = y.getPixelForValue(m.y);
        if (py < ca.top || py > ca.bottom) continue;
        ctx.fillStyle = m.color; ctx.strokeStyle = COLORS.bg; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        if (m.label) ctx.fillText(m.label, px, py + (m.below ? 18 : -10));
      }
      // freccia tra due punti (gap)
      for (const ar of o.arrows || []) {
        const x1 = x.getPixelForValue(ar.x1), y1 = y.getPixelForValue(ar.y1);
        const x2 = x.getPixelForValue(ar.x2), y2 = y.getPixelForValue(ar.y2);
        ctx.strokeStyle = ar.color; ctx.fillStyle = ar.color; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
        const ang = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath(); ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 9 * Math.cos(ang - 0.4), y2 - 9 * Math.sin(ang - 0.4));
        ctx.lineTo(x2 - 9 * Math.cos(ang + 0.4), y2 - 9 * Math.sin(ang + 0.4));
        ctx.closePath(); ctx.fill();
        if (ar.label) { ctx.textAlign = 'left'; ctx.fillText(ar.label, (x1 + x2) / 2 + 8, (y1 + y2) / 2); ctx.textAlign = 'center'; }
      }
      ctx.restore();
    }
  };

  function initCharts() {
    Chart.register(overlaysPlugin);
    Chart.defaults.color = COLORS.muted;
    Chart.defaults.borderColor = 'rgba(148,160,187,.12)';
    Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.animation = false;              // aggiornamenti in tempo reale fluidi
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(11,16,32,.92)';
    Chart.defaults.plugins.tooltip.borderColor = COLORS['line-2'];
    Chart.defaults.plugins.tooltip.borderWidth = 1;
  }

  /** Grafico generico "scatter con linee" con assi numerici. */
  function makeChart(canvas, { xTitle, yTitle, y2Title, x = {}, y = {}, y2 = null, legend = true }) {
    const scales = {
      x: { type: 'linear', title: { display: !!xTitle, text: xTitle }, ...x },
      y: { type: 'linear', title: { display: !!yTitle, text: yTitle }, ...y }
    };
    if (y2) scales.y2 = { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: !!y2Title, text: y2Title }, ...y2 };
    return new Chart(canvas, {
      type: 'scatter',
      data: { datasets: [] },
      options: {
        responsive: true,
        // 'nearest' sugli assi x e y: il tooltip segue il punto più vicino al
        // cursore su QUALSIASI curva (con axis 'x' sceglierebbe una curva a caso
        // tra quelle che passano per la stessa ascissa)
        interaction: { mode: 'nearest', intersect: false, axis: 'xy' },
        plugins: {
          legend: { display: legend, labels: { boxWidth: 14, boxHeight: 2, usePointStyle: false, filter: it => !it.text.startsWith('_') } },
          // BUG CORRETTO: prima il filtro scartava tutte le curve con etichetta
          // interna "_" (cioè quasi tutte le bande), quindi il pallino compariva
          // ma il riquadro con i valori no. Ora si esclude solo ciò che è
          // marcato esplicitamente con noTip.
          tooltip: {
            enabled: true,
            mode: 'nearest', intersect: false, axis: 'xy',
            filter: it => !it.dataset.noTip,
            callbacks: {
              title: () => '',
              label: c => {
                // I formattatori stanno sull'istanza (chart.$fmtX / $fmtY), NON in
                // options: Chart.js tratta ogni funzione dentro options come opzione
                // "scriptable", la chiama da sé e la sostituisce con il risultato.
                const ds = c.dataset, ch = c.chart;
                const name = ds.tip || (ds.label && !ds.label.startsWith('_') ? ds.label : 'curva');
                const xs = typeof ch.$fmtX === 'function' ? ch.$fmtX(c.parsed.x) : `x = ${c.parsed.x.toFixed(3)}`;
                const ys = typeof ch.$fmtY === 'function' ? ch.$fmtY(c.parsed.y) : `y = ${c.parsed.y.toFixed(3)}`;
                return `${name} — ${xs}, ${ys}`;
              }
            }
          },
          overlays: {}
        },
        elements: { point: { radius: 0, hoverRadius: 3 }, line: { tension: 0 } },
        scales
      }
    });
  }

  /** Grafico delle bande E(k) 3D.
   *  - asse Y senza massimo rigido (suggestedMin/Max): nessuna banda tagliata
   *  - interaction 'nearest' lungo x con intersect:false: passando il mouse in
   *    qualsiasi punto si ottengono i valori di TUTTE le bande in quel k
   *    (tutte le bande condividono le stesse ascisse, quindi sono tutte
   *    "le più vicine" lungo x)
   *  - etichette dei punti ad alta simmetria disegnate dal plugin overlays */
  function makeBandChart(canvas, { describeK } = {}) {
    return new Chart(canvas, {
      type: 'scatter',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { bottom: 22 } },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        },
        elements: { point: { radius: 0, hoverRadius: 4 }, line: { tension: 0 } },
        scales: {
          x: { type: 'linear', min: 0, ticks: { display: false }, grid: { display: false } },
          y: { type: 'linear', suggestedMin: -14, suggestedMax: 15, title: { display: true, text: 'E (eV)' } }
        },
        plugins: {
          legend: {
            display: true,
            labels: {
              boxWidth: 14, boxHeight: 2,
              // in legenda una voce per gruppo (valenza / conduzione), non per banda
              filter: (it, data) => !data.datasets[it.datasetIndex].hideInLegend,
              generateLabels: chart => Chart.defaults.plugins.legend.labels.generateLabels(chart)
                .map(l => ({ ...l, text: chart.data.datasets[l.datasetIndex].legendText || l.text }))
            }
          },
          tooltip: {
            enabled: true,
            mode: 'nearest',
            axis: 'x',
            intersect: false,
            // bande dall'energia più alta alla più bassa, come nel grafico
            itemSort: (a, b) => b.parsed.y - a.parsed.y,
            callbacks: {
              title: items => (items.length && describeK ? describeK(items[0].parsed.x) : ''),
              label: function (context) {
                let label = context.dataset.label || '';
                if (label) { label += ': '; }
                if (context.parsed.y !== null) {
                  label += context.parsed.y.toFixed(2) + ' eV';
                }
                return label;
              }
            }
          },
          overlays: {}
        }
      }
    });
  }

  /** Crea un dataset linea. label che inizia con "_" = nascosto in legenda. */
  function line(data, color, opts = {}) {
    return {
      label: opts.label || '_', data, showLine: true, borderColor: color,
      // nome mostrato nel tooltip (anche per le curve nascoste in legenda)
      tip: opts.tip || (opts.label && !opts.label.startsWith('_') ? opts.label : undefined),
      noTip: !!opts.noTip,
      backgroundColor: opts.fillColor || color, borderWidth: opts.width ?? 2,
      borderDash: opts.dash || [], fill: opts.fill ?? false, yAxisID: opts.yAxisID || 'y',
      pointRadius: 0, order: opts.order ?? 1
    };
  }

  return {
    COLORS, loadColors, initCharts, setActive,
    ThreeView, LatticeView, EwaldViews,
    makeChart, makeBandChart, line
  };
})();
