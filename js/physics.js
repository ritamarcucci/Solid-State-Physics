/* =============================================================================
 *  physics.js — Motore fisico di "Solid State Lab"
 * =============================================================================
 *  Questo file NON tocca il DOM: contiene solo costanti, dati e funzioni
 *  matematiche. È quindi testabile anche da Node (vedi module.exports in fondo).
 *
 *  Unità di misura adottate ovunque (salvo diversa indicazione):
 *    - lunghezze  : Å (ångström, 1 Å = 1e-10 m)
 *    - energie    : eV
 *    - vettori k  : Å⁻¹   (nei grafici E-k si usa k in unità di π/a)
 *    - masse      : u (unità di massa atomica) nei dati, kg nei calcoli SI
 *
 *  Contenuto:
 *    1. Costanti fisiche
 *    2. Database materiali (parametri tabulati: Kittel, Ashcroft-Mermin,
 *       International Tables for Crystallography Vol. C, Harrison)
 *    3. Cristallografia: impacchettamento, fattore di struttura, fattore di
 *       forma atomico, reticolo reciproco, condizione di Laue, polveri
 *    4. Bande: Kronig-Penney, tight-binding 1D, fononi, pseudopotenziale
 * ============================================================================= */
'use strict';

const Physics = (() => {

  /* ---------------------------------------------------------------------------
   * 1. COSTANTI FISICHE
   * ------------------------------------------------------------------------- */
  const CONST = {
    HBAR2_2M: 3.80998,     // ħ²/(2mₑ)       [eV·Å²]  -> E = ħ²k²/2m = 3.81·k²
    HBAR2_M: 7.61996,      // ħ²/mₑ          [eV·Å²]  (usata nelle regole di Harrison)
    E2: 14.39964,          // e²/(4πε₀)      [eV·Å]   -> potenziale coulombiano
    H: 6.62607015e-34,     // costante di Planck [J·s]
    KB: 1.380649e-23,      // costante di Boltzmann [J/K]
    AMU: 1.66053907e-27,   // unità di massa atomica [kg]
    BOHR: 0.529177,        // raggio di Bohr [Å]
    DEG: 180 / Math.PI
  };

  /* Righe di emissione caratteristiche (Kα1) dei tubi a raggi X più comuni. */
  const WAVELENGTHS = [
    { id: 'CuKa1', label: 'Cu Kα₁ — 1.5406 Å', value: 1.54056 },
    { id: 'CoKa1', label: 'Co Kα₁ — 1.7890 Å', value: 1.78897 },
    { id: 'MoKa1', label: 'Mo Kα₁ — 0.7093 Å', value: 0.70932 }
  ];

  /* ---------------------------------------------------------------------------
   * 2. STRUTTURE CRISTALLINE CUBICHE
   *    basis : posizioni frazionarie degli atomi nella cella convenzionale
   *    touch : raggio di contatto r_max in unità di a
   *            SC  -> atomi in contatto lungo lo spigolo     r = a/2
   *            BCC -> lungo la diagonale di corpo             r = a√3/4
   *            FCC -> lungo la diagonale di faccia            r = a√2/4
   *            Diamante -> legame lungo 1/4 della diag. corpo r = a√3/8
   * ------------------------------------------------------------------------- */
  const FCC_BASIS = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
  const STRUCTURES = {
    sc:  { label: 'Cubico semplice (SC)', basis: [[0, 0, 0]], touch: 0.5, dirs: '⟨100⟩ (spigoli)' },
    bcc: { label: 'Cubico a corpo centrato (BCC)', basis: [[0, 0, 0], [0.5, 0.5, 0.5]], touch: Math.sqrt(3) / 4, dirs: '⟨111⟩ (diagonali di corpo)' },
    fcc: { label: 'Cubico a facce centrate (FCC)', basis: FCC_BASIS, touch: Math.sqrt(2) / 4, dirs: '⟨110⟩ (diagonali di faccia)' },
    diamond: {
      label: 'Diamante (FCC + base a ¼¼¼)',
      basis: FCC_BASIS.concat(FCC_BASIS.map(p => p.map(x => x + 0.25))),
      touch: Math.sqrt(3) / 8, dirs: '⟨111⟩ (legami tetraedrici)'
    }
  };
  // Fattore di impacchettamento ideale: APF = N·(4/3)π·touch³
  // (SC = π/6 ≈ 0.524, BCC = π√3/8 ≈ 0.680, FCC = π/(3√2) ≈ 0.740, diamante = π√3/16 ≈ 0.340)
  for (const s of Object.values(STRUCTURES)) {
    s.N = s.basis.length;
    s.apfIdeal = s.N * (4 / 3) * Math.PI * Math.pow(s.touch, 3);
  }

  /* ---------------------------------------------------------------------------
   * 3. DATABASE MATERIALI (valori a temperatura ambiente salvo nota)
   *
   *  a       : costante reticolare [Å]                      (Kittel, cap. 1, Tab. 3-4)
   *  rMetal  : raggio metallico tabulato per CN=12 [Å]      (Kittel / Greenwood-Earnshaw)
   *            per il Si è il raggio covalente
   *  thetaD  : temperatura di Debye [K]                     (Kittel, cap. 5, Tab. 1)
   *  valence : elettroni di valenza per atomo               (Ashcroft-Mermin, Tab. 1.1)
   *  Tm      : temperatura di fusione [K]                   (CRC Handbook)
   *  cm      : coefficienti di Cromer-Mann del fattore di forma atomico
   *            f(s) = Σ aᵢ·exp(−bᵢ s²) + c,  s = sinθ/λ [Å⁻¹]
   *            [a1,b1,a2,b2,a3,b3,a4,b4,c]  (Int. Tables for Crystallography Vol. C, Tab. 6.1.1.4)
   *
   *  Nota sul raggio: il raggio CN=12 è leggermente maggiore del raggio di
   *  contatto in una BCC (CN=8) — correzione di Goldschmidt (~3%). È un buon
   *  esercizio farlo notare agli studenti confrontando i due valori.
   * ------------------------------------------------------------------------- */
  const MATERIALS = {
    Cu: { name: 'Rame', Tm: 1358, Z: 29, A: 63.546, structure: 'fcc', a: 3.615, rMetal: 1.28, thetaD: 343, valence: 1,
          cm: [13.3380, 3.5828, 7.1676, 0.2470, 5.6158, 11.3966, 1.6735, 64.8126, 1.1910] },
    Al: { name: 'Alluminio', Tm: 933, Z: 13, A: 26.982, structure: 'fcc', a: 4.050, rMetal: 1.43, thetaD: 428, valence: 3,
          cm: [6.4202, 3.0387, 1.9002, 0.7426, 1.5936, 31.5472, 1.9646, 85.0886, 1.1151] },
    Ni: { name: 'Nichel', Tm: 1728, Z: 28, A: 58.693, structure: 'fcc', a: 3.524, rMetal: 1.24, thetaD: 450, valence: 2,
          cm: [12.8376, 3.8785, 7.2920, 0.2565, 4.4438, 12.1763, 2.3800, 66.3421, 1.0341] },
    Au: { name: 'Oro', Tm: 1337, Z: 79, A: 196.967, structure: 'fcc', a: 4.078, rMetal: 1.44, thetaD: 165, valence: 1,
          cm: [16.8819, 0.4611, 18.5913, 8.6216, 25.5582, 1.4826, 5.8600, 36.3956, 12.0658] },
    Fe: { name: 'Ferro (α)', Tm: 1811, Z: 26, A: 55.845, structure: 'bcc', a: 2.8665, rMetal: 1.26, thetaD: 470, valence: 2,
          cm: [11.7695, 4.7611, 7.3573, 0.3072, 3.5222, 15.3535, 2.3045, 76.8805, 1.0369] },
    W:  { name: 'Tungsteno', Z: 74, A: 183.84, structure: 'bcc', a: 3.165, rMetal: 1.39, thetaD: 400, valence: 2,
          cm: [29.0818, 1.72029, 15.4300, 9.2259, 14.4327, 0.321703, 5.11982, 57.0560, 9.8875] },
    Na: { name: 'Sodio (a 5 K)', Tm: 371, Z: 11, A: 22.990, structure: 'bcc', a: 4.225, rMetal: 1.90, thetaD: 158, valence: 1,
          cm: [4.7626, 3.2850, 3.1736, 8.8422, 1.2674, 0.3136, 1.1128, 129.424, 0.6760] },
    Si: { name: 'Silicio', Tm: 1687, Z: 14, A: 28.086, structure: 'diamond', a: 5.431, rMetal: 1.175, thetaD: 645, valence: 4,
          cm: [6.2915, 2.4386, 3.0353, 32.3337, 1.9891, 0.6785, 1.5410, 81.6937, 1.1407] },
    // α-Po: unico elemento cubico semplice a T ambiente. Θ_D non è misurata in
    // modo affidabile, quindi viene escluso dagli strumenti termici.
    Po: { name: 'Polonio (α)', Tm: 527, Z: 84, A: 208.98, structure: 'sc', a: 3.359, rMetal: 1.68, thetaD: null, valence: 6,
          cm: [34.6726, 0.700999, 15.4733, 3.55078, 13.1138, 9.55642, 7.02588, 47.0045, 13.6770] },
    // Mg è esagonale (hcp): usato solo per il conteggio degli elettroni di valenza
    // e nel modulo pseudopotenziale.
    Mg: { name: 'Magnesio (hcp)', Tm: 923, Z: 12, A: 24.305, structure: 'hcp', a: 3.209, rMetal: 1.60, thetaD: 400, valence: 2, cm: null }
  };

  /* ===========================================================================
   * CRISTALLOGRAFIA
   * ========================================================================= */

  /** Siti della cella convenzionale da disegnare, con il peso con cui ciascun
   *  atomo "appartiene" alla cella (vertice 1/8, faccia 1/2, centro 1). */
  function cellSites(structure) {
    const sites = [];
    for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1])
      sites.push({ p: [x, y, z], w: 1 / 8, kind: 'corner' });
    if (structure === 'bcc') sites.push({ p: [0.5, 0.5, 0.5], w: 1, kind: 'body' });
    if (structure === 'fcc' || structure === 'diamond') {
      for (const ax of [0, 1, 2]) for (const v of [0, 1]) {
        const p = [0.5, 0.5, 0.5]; p[ax] = v;
        sites.push({ p, w: 1 / 2, kind: 'face' });
      }
    }
    if (structure === 'diamond') {            // 4 atomi interni in siti tetraedrici
      for (const p of [[.25, .25, .25], [.75, .75, .25], [.75, .25, .75], [.25, .75, .75]])
        sites.push({ p, w: 1, kind: 'body' });
    }
    return sites;
  }

  /** Segmenti (in coordinate frazionarie) lungo le direzioni compatte, cioè
   *  le direzioni in cui le sfere si toccano quando r = r_contatto. */
  function closePackedSegments(structure) {
    const seg = [];
    if (structure === 'sc') {               // 12 spigoli ⟨100⟩
      for (const a of [0, 1]) for (const b of [0, 1]) {
        seg.push([[0, a, b], [1, a, b]], [[a, 0, b], [a, 1, b]], [[a, b, 0], [a, b, 1]]);
      }
    } else if (structure === 'bcc') {       // 4 diagonali di corpo ⟨111⟩
      seg.push([[0, 0, 0], [1, 1, 1]], [[1, 0, 0], [0, 1, 1]], [[0, 1, 0], [1, 0, 1]], [[0, 0, 1], [1, 1, 0]]);
    } else if (structure === 'fcc') {       // 12 diagonali di faccia ⟨110⟩
      for (const ax of [0, 1, 2]) for (const v of [0, 1]) {
        const i = (ax + 1) % 3, j = (ax + 2) % 3;
        const p = (u, w) => { const q = [0, 0, 0]; q[ax] = v; q[i] = u; q[j] = w; return q; };
        seg.push([p(0, 0), p(1, 1)], [p(1, 0), p(0, 1)]);
      }
    }
    return seg;
  }

  /** Fattore di impacchettamento atomico per raggio r.
   *  APF = N·(4/3)πr³ / a³ , valido finché le sfere non si compenetrano (r ≤ r_t). */
  function packing(structure, a, r) {
    const s = STRUCTURES[structure];
    const rTouch = s.touch * a;
    const Vcell = a * a * a;
    const Vatoms = s.N * (4 / 3) * Math.PI * r * r * r;
    return { N: s.N, Vcell, Vatoms, apf: Vatoms / Vcell, rTouch, apfIdeal: s.apfIdeal };
  }

  /** Fattore di forma atomico f(s) (Cromer-Mann), s = sinθ/λ. Per s=0 → ≈ Z. */
  function formFactor(mat, s) {
    const c = mat.cm;
    if (!c) return mat.Z;
    const s2 = s * s;
    return c[0] * Math.exp(-c[1] * s2) + c[2] * Math.exp(-c[3] * s2) +
           c[4] * Math.exp(-c[5] * s2) + c[6] * Math.exp(-c[7] * s2) + c[8];
  }

  /** Parte geometrica del fattore di struttura per un cristallo monoatomico:
   *  S(hkl) = Σⱼ exp[2πi(h xⱼ + k yⱼ + l zⱼ)];  F = f·S.
   *  Le estinzioni sistematiche sono i casi S = 0:
   *    BCC: h+k+l dispari; FCC: indici misti; Diamante: FCC e in più h+k+l = 4n+2. */
  function geomStructureFactor(structure, h, k, l) {
    let re = 0, im = 0;
    for (const [x, y, z] of STRUCTURES[structure].basis) {
      const ph = 2 * Math.PI * (h * x + k * y + l * z);
      re += Math.cos(ph); im += Math.sin(ph);
    }
    if (Math.abs(re) < 1e-9) re = 0;
    if (Math.abs(im) < 1e-9) im = 0;
    return { re, im, abs2: re * re + im * im };
  }

  /** Molteplicità di una famiglia {hkl} nel sistema cubico (gruppo di Laue m-3m):
   *  numero di permutazioni distinte con tutte le combinazioni di segno. */
  function multiplicity(h, k, l) {
    const v = [h, k, l], set = new Set();
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const p of perms) for (let s = 0; s < 8; s++) {
      set.add([v[p[0]] * (s & 1 ? -1 : 1), v[p[1]] * (s & 2 ? -1 : 1), v[p[2]] * (s & 4 ? -1 : 1)].join(','));
    }
    return set.size;
  }

  /** Funzione di Debye φ(x) = (1/x)∫₀ˣ t/(eᵗ−1) dt  (integrazione di Simpson). */
  function debyePhi(x) {
    if (x < 1e-6) return 1;
    const n = 200, h = x / n;
    let s = 0;
    for (let i = 0; i <= n; i++) {
      const t = i * h;
      const g = t === 0 ? 1 : t / Math.expm1(t);
      s += (i === 0 || i === n ? 1 : (i % 2 ? 4 : 2)) * g;
    }
    return (s * h / 3) / x;
  }

  /** Parametro di Debye-Waller B(T) [Å²] nel modello di Debye:
   *    B = (6h²T)/(m k_B Θ_D²) · [φ(x) + x/4],   x = Θ_D/T
   *  Il termine x/4 è il contributo di punto zero (B resta finito a T→0).
   *  L'intensità di Bragg viene attenuata di exp(−2B s²). */
  function debyeWallerB(mat, T) {
    if (!mat.thetaD) return 0;
    const m = mat.A * CONST.AMU;
    const Tt = Math.max(T, 0.01);
    const x = mat.thetaD / Tt;
    const B = 6 * CONST.H * CONST.H * Tt / (m * CONST.KB * mat.thetaD * mat.thetaD) * (debyePhi(x) + x / 4);
    return B * 1e20; // m² → Å²
  }

  /* --------------------------------------------------------------------------
   *  Reticolo reciproco e condizione di Laue (metodo di Laue, fascio bianco)
   *
   *  Nodi: G = (2π/a)(h,k,l) nel riferimento del cristallo, ruotati da R.
   *  Fascio incidente: k_in = (2π/λ) û. La condizione di diffrazione
   *  |k_in + G| = |k_in| equivale a  2 k_in·G + G² = 0, da cui la lunghezza
   *  d'onda che "accende" il nodo:
   *          λ_G = −4π (û·G) / |G|²      (serve û·G < 0)
   *  Con radiazione policromatica [λmin, λmax] il nodo diffrange se λ_G cade
   *  nell'intervallo: geometricamente il nodo sta tra le due sfere di Ewald di
   *  raggi 2π/λmax e 2π/λmin, entrambe passanti per l'origine.
   * ------------------------------------------------------------------------ */
  function laueNodes({ structure, a, mat, R, u = [1, 0, 0], lamMin, lamMax, hmax = 3 }) {
    const nodes = [];
    const g0 = 2 * Math.PI / a;
    for (let h = -hmax; h <= hmax; h++) for (let k = -hmax; k <= hmax; k++) for (let l = -hmax; l <= hmax; l++) {
      if (!h && !k && !l) continue;
      const S = geomStructureFactor(structure, h, k, l);
      const extinct = S.abs2 < 1e-6;
      const G0 = [g0 * h, g0 * k, g0 * l];
      const G = [
        R[0][0] * G0[0] + R[0][1] * G0[1] + R[0][2] * G0[2],
        R[1][0] * G0[0] + R[1][1] * G0[1] + R[1][2] * G0[2],
        R[2][0] * G0[0] + R[2][1] * G0[1] + R[2][2] * G0[2]
      ];
      const node = { h, k, l, G, extinct, lit: false };
      if (!extinct) {
        const uG = u[0] * G[0] + u[1] * G[1] + u[2] * G[2];
        const G2 = G[0] * G[0] + G[1] * G[1] + G[2] * G[2];
        if (uG < 0) {
          const lam = -4 * Math.PI * uG / G2;
          if (lam >= lamMin && lam <= lamMax) {
            const kk = 2 * Math.PI / lam;
            const kout = [kk * u[0] + G[0], kk * u[1] + G[1], kk * u[2] + G[2]];
            const s = Math.sqrt(G2) / (4 * Math.PI);            // sinθ/λ = |G|/4π
            const f = formFactor(mat, s);
            node.lit = true;
            node.lambda = lam;
            node.kout = kout;
            node.k = kk;
            node.twoTheta = Math.acos(Math.min(1, (kout[0] * u[0] + kout[1] * u[1] + kout[2] * u[2]) / kk)) * CONST.DEG;
            node.I = S.abs2 * f * f;                              // |F|² (senza Lorentz-polarizzazione)
          }
        }
      }
      nodes.push(node);
    }
    return nodes;
  }

  /* --------------------------------------------------------------------------
   *  Diffrattogramma di polveri (geometria Bragg-Brentano)
   *
   *  Per ogni famiglia {hkl}:
   *    d = a/√(h²+k²+l²) · (1+ε)                 (ε = deformazione uniforme)
   *    λ = 2 d sinθ                              (legge di Bragg)
   *    I = m·|F|²·LP(θ)·exp(−2B s²)
   *    LP = (1+cos²2θ)/(sin²θ cosθ)              (Lorentz-polarizzazione)
   *  Profilo dei picchi: pseudo-Voigt (η = 0.5) con FWHM (in rad, su 2θ):
   *    β_size   = Kλ/(L cosθ)        Scherrer, K = 0.9
   *    β_strain = 4 ε_rms tanθ       microdeformazione (Williamson-Hall)
   *    β_strum  = 0.06°              allargamento strumentale tipico
   *  combinate in quadratura (approssimazione). Un gradiente di deformazione
   *  (distribuzione unilaterale di d) produce una coda asimmetrica verso
   *  bassi angoli: semilarghezza sinistra aumentata di 4·Δε·tanθ.
   *  Fondo: diffusione termica diffusa (TDS) ∝ f²[1 − exp(−2Bs²)] + fondo d'aria.
   * ------------------------------------------------------------------------ */
  function powderPattern(opts) {
    const {
      mat, structure, a, lambda, sizeNm, T, strain = 0, microstrain = 0, gradient = 0,
      tt0 = 15, tt1 = 150, n = 2700
    } = opts;
    const K = 0.9;
    const L = sizeNm * 10;                         // nm → Å
    const B = debyeWallerB(mat, T);
    const Hinst = 0.06 / CONST.DEG;                // rad
    const eta = 0.5;
    const cShape = eta * Math.PI / 2 + (1 - eta) * Math.sqrt(Math.PI / (4 * Math.LN2));
    const N = STRUCTURES[structure].N;

    // 1) elenco delle riflessioni permesse
    const peaks = [];
    const hmax = Math.ceil(2 * a * (1 + Math.abs(strain)) / lambda) + 1;
    for (let h = 0; h <= hmax; h++) for (let k = 0; k <= h; k++) for (let l = 0; l <= k; l++) {
      const N2 = h * h + k * k + l * l;
      if (!N2) continue;
      const d = a / Math.sqrt(N2) * (1 + strain);
      const sinT = lambda / (2 * d);
      if (sinT >= 1) continue;
      const th = Math.asin(sinT);
      const tt = 2 * th * CONST.DEG;
      if (tt < tt0 || tt > tt1) continue;
      const S = geomStructureFactor(structure, h, k, l);
      if (S.abs2 < 1e-6) continue;                 // estinzione sistematica
      const s = sinT / lambda;
      const f = formFactor(mat, s);
      const m = multiplicity(h, k, l);
      const LP = (1 + Math.cos(2 * th) ** 2) / (sinT * sinT * Math.cos(th));
      const I0 = m * S.abs2 * f * f * LP;          // senza Debye-Waller
      const DW = Math.exp(-2 * B * s * s);
      const bSize = K * lambda / (L * Math.cos(th));
      const bStrain = 4 * microstrain * Math.tan(th);
      const H = Math.sqrt(Hinst ** 2 + bSize ** 2 + bStrain ** 2) * CONST.DEG; // gradi
      const Hl = H + 4 * gradient * Math.tan(th) * CONST.DEG;
      peaks.push({ h, k, l, d, tt, m, F2: S.abs2 * f * f, f, I0, I: I0 * DW, DW, H, Hl, Hr: H, bSizeDeg: bSize * CONST.DEG });
    }

    // 2) profilo: somma di pseudo-Voigt "split" (stessa altezza al centro,
    //    semilarghezze diverse a sinistra/destra; area conservata)
    const shape = u => eta / (1 + 4 * u * u) + (1 - eta) * Math.exp(-4 * Math.LN2 * u * u);
    const x = new Float64Array(n), y = new Float64Array(n), yRef = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = tt0 + (tt1 - tt0) * i / (n - 1);
    for (const p of peaks) {
      const hgt = p.I / (cShape * (p.Hl + p.Hr) / 2);
      const hgtRef = p.I0 / (cShape * (p.Hl + p.Hr) / 2);
      p.height = hgt;
      const span = 25 * Math.max(p.Hl, p.Hr);
      const i0 = Math.max(0, Math.floor((p.tt - span - tt0) / (tt1 - tt0) * (n - 1)));
      const i1 = Math.min(n - 1, Math.ceil((p.tt + span - tt0) / (tt1 - tt0) * (n - 1)));
      for (let i = i0; i <= i1; i++) {
        const dx = x[i] - p.tt;
        const sh = shape(dx / (dx < 0 ? p.Hl : p.Hr));
        y[i] += hgt * sh; yRef[i] += hgtRef * sh;
      }
    }
    // normalizzazione: 100 = picco più alto a B = 0 (così l'effetto della T è visibile)
    let ref = 0;
    for (let i = 0; i < n; i++) ref = Math.max(ref, yRef[i]);
    ref = ref || 1;
    const Z2 = mat.Z * mat.Z;
    for (let i = 0; i < n; i++) {
      const th = x[i] / 2 / CONST.DEG;
      const s = Math.sin(th) / lambda;
      const f = formFactor(mat, s);
      const tds = 40 * N / 4 * (f * f / Z2) * (1 - Math.exp(-2 * B * s * s)); // diffusione termica diffusa
      const air = 1.2 * Math.exp(-(x[i] - tt0) / 25) + 0.4;                   // fondo d'aria/fluorescenza
      y[i] = y[i] / ref * 100 + tds + air;
    }
    for (const p of peaks) { p.relHeight = p.height / ref * 100; }
    const Imax = Math.max(...peaks.map(p => p.I), 1e-30);
    for (const p of peaks) p.Irel = 100 * p.I / Imax;
    return { x, y, peaks, B };
  }

  /* ===========================================================================
   * BANDE — MODELLO DI KRONIG-PENNEY
   *
   *  Potenziale periodico di periodo a: buca (V=0) larga w = a − b, barriera
   *  (V = V₀) larga b. Imponendo continuità di ψ e ψ' e il teorema di Bloch
   *  si ottiene l'equazione trascendente ESATTA:
   *
   *   E < V₀:  cos(ka) = cos(αw)cosh(βb) + (β²−α²)/(2αβ)·sin(αw)sinh(βb)
   *   E > V₀:  cos(ka) = cos(αw)cos(γb)  − (α²+γ²)/(2αγ)·sin(αw)sin(γb)
   *
   *   con α = √(2mE)/ħ, β = √(2m(V₀−E))/ħ, γ = √(2m(E−V₀))/ħ.
   *  Le energie con |RHS| ≤ 1 sono permesse (bande), le altre sono i gap.
   *  Con V₀ = 0 l'equazione si riduce a cos(ka) = cos(αa): parabola ripiegata.
   * ========================================================================= */
  function kpRHS(E, V0, a, b) {
    const alpha = Math.sqrt(Math.max(E, 1e-12) / CONST.HBAR2_2M);
    if (V0 <= 0 || b <= 0) return Math.cos(alpha * a);
    const w = a - b;
    if (Math.abs(E - V0) < 1e-9) E += 1e-7;   // evita la singolarità E = V₀
    if (E < V0) {
      const beta = Math.sqrt((V0 - E) / CONST.HBAR2_2M);
      return Math.cos(alpha * w) * Math.cosh(beta * b) +
        (beta * beta - alpha * alpha) / (2 * alpha * beta) * Math.sin(alpha * w) * Math.sinh(beta * b);
    }
    const gamma = Math.sqrt((E - V0) / CONST.HBAR2_2M);
    return Math.cos(alpha * w) * Math.cos(gamma * b) -
      (alpha * alpha + gamma * gamma) / (2 * alpha * gamma) * Math.sin(alpha * w) * Math.sin(gamma * b);
  }

  /** Calcola le prime nBands bande. Restituisce per ciascuna i punti (k,E),
   *  con k in unità di π/a (kr ∈ [0,1]), e i bordi di banda raffinati per
   *  bisezione sulla condizione |RHS| = 1. */
  function kpBands({ V0, a, bFrac, nBands = 4, nE = 9000 }) {
    const b = bFrac * a;
    const Emax = CONST.HBAR2_2M * Math.pow((nBands + 0.15) * Math.PI / a, 2) + V0 * 1.05;
    const dE = Emax / nE;
    const allowed = E => Math.abs(kpRHS(E, V0, a, b)) <= 1;
    const edge = (E1, E2) => {                         // bisezione tra permesso/proibito
      const a1 = allowed(E1);
      for (let i = 0; i < 50; i++) { const m = (E1 + E2) / 2; if (allowed(m) === a1) E1 = m; else E2 = m; }
      return a1 ? E1 : E2;
    };
    const kr = E => Math.acos(Math.max(-1, Math.min(1, kpRHS(E, V0, a, b)))) / Math.PI;

    const bands = [];
    let cur = null, prevE = 0, prevRHS = null, prevDir = 0;
    for (let i = 1; i <= nE && bands.length < nBands; i++) {
      const E = i * dE;
      const rhs = kpRHS(E, V0, a, b);
      const ok = Math.abs(rhs) <= 1;
      if (ok && !cur) {                                 // inizio banda (dopo un gap)
        const Ee = i === 1 ? 1e-6 : edge(prevE, E);
        cur = { pts: [{ k: kr(Ee), E: Ee }] };
        prevDir = 0;
      }
      if (ok && cur) {
        // con gap nullo o minuscolo RHS tocca ±1 senza uscire: lo si riconosce
        // dall'inversione della monotonia di RHS(E) -> nuova banda
        const dir = prevRHS === null ? 0 : Math.sign(rhs - prevRHS);
        if (prevDir && dir && dir !== prevDir && Math.abs(rhs) > 0.98) {
          const kEdge = Math.round(cur.pts[cur.pts.length - 1].k);
          cur.pts.push({ k: kEdge, E: prevE });
          bands.push(finalize(cur)); cur = { pts: [{ k: kEdge, E: prevE }] };
          if (bands.length >= nBands) break;
        }
        if (dir) prevDir = dir;
        cur.pts.push({ k: kr(E), E });
      }
      if (!ok && cur) {                                 // fine banda
        const Ee = edge(prevE, E);
        cur.pts.push({ k: Math.round(cur.pts[cur.pts.length - 1].k), E: Ee });
        bands.push(finalize(cur)); cur = null;
      }
      prevE = E; prevRHS = rhs;
    }
    if (cur && bands.length < nBands) bands.push(finalize(cur));
    function finalize(c) {
      c.Emin = c.pts[0].E; c.Emax = c.pts[c.pts.length - 1].E;
      return c;
    }
    const gaps = [];
    for (let i = 0; i + 1 < bands.length; i++) {
      gaps.push({ Elo: bands[i].Emax, Ehi: bands[i + 1].Emin, width: Math.max(0, bands[i + 1].Emin - bands[i].Emax), at: (i % 2 === 0) ? 1 : 0 });
    }
    return { bands, gaps, Emax, Vavg: V0 * bFrac };
  }

  /** Parabola dell'elettrone libero ripiegata nella 1ª zona (schema ridotto),
   *  spostata del potenziale medio V̄ = V₀·b/a (risultato al 1° ordine perturbativo). */
  function freeElectronFolded(a, Vavg, Emax, mMax = 3, n = 161) {
    const curves = [];
    for (let m = -mMax; m <= mMax; m++) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const kr = -1 + 2 * i / (n - 1);
        const k = kr * Math.PI / a + 2 * Math.PI * m / a;
        const E = CONST.HBAR2_2M * k * k + Vavg;
        if (E <= Emax) pts.push({ k: kr, E });
      }
      if (pts.length) curves.push(pts);
    }
    return curves;
  }

  /** Livello di Fermi (T = 0) per Z elettroni per cella in 1D.
   *  Ogni banda contiene 2 stati per cella (spin). Quindi:
   *   - Z dispari: la banda (Z+1)/2 è piena a metà → k_F = π/(2a), metallo
   *   - Z pari   : Z/2 bande piene → E_F nel gap (isolante) o metallo se gap ≈ 0 */
  function kpFermi(kp, Z) {
    const { bands } = kp;
    if (Z % 2 === 1) {
      const band = bands[(Z - 1) / 2];
      if (!band) return null;
      const pts = band.pts.slice().sort((p, q) => p.k - q.k);
      for (let i = 0; i + 1 < pts.length; i++) {
        if ((pts[i].k - 0.5) * (pts[i + 1].k - 0.5) <= 0) {
          const t = (0.5 - pts[i].k) / ((pts[i + 1].k - pts[i].k) || 1);
          return { EF: pts[i].E + t * (pts[i + 1].E - pts[i].E), metal: true, gap: 0, band: (Z + 1) / 2 };
        }
      }
      return null;
    }
    const lo = bands[Z / 2 - 1], hi = bands[Z / 2];
    if (!lo || !hi) return null;
    const gap = hi.Emin - lo.Emax;
    return { EF: (lo.Emax + hi.Emin) / 2, metal: gap < 0.02, gap: Math.max(0, gap), band: Z / 2 };
  }

  /* ===========================================================================
   * BANDE — TIGHT BINDING 1D
   *
   *  Integrali di hopping dalla regola universale di Harrison (orbitali s):
   *      V_ssσ(d) = η_ssσ · ħ²/(m d²),   η_ssσ = −1.40
   *  (W. A. Harrison, "Electronic Structure and the Properties of Solids", 1980).
   *  Definiamo t(d) = |V_ssσ(d)| > 0, così per orbitali s: E = ε − 2t cos(ka) − …
   *  Nota: la legge 1/d² estesa ai vicini lontani sovrastima t₂, t₃ (in realtà
   *  decadono più rapidamente); qui serve a mostrare come le correzioni
   *  deformino la banda.
   * ========================================================================= */
  const ETA_SS_SIGMA = 1.40;
  const harrisonT = d => ETA_SS_SIGMA * CONST.HBAR2_M / (d * d);

  /** Catena monoatomica (passo a): E(k) = ε − 2t₁cos(ka) − 2t₂cos(2ka) − 2t₃cos(3ka) */
  function tbMono(kr, a, eps, orders) {
    const ka = Math.PI * kr;
    let E = eps;
    for (let n = 1; n <= 3; n++) if (orders[n - 1]) E -= 2 * harrisonT(n * a) * Math.cos(n * ka);
    return E;
  }

  /** Catena biatomica A–B (cella a, B in a/2). Hamiltoniana di Bloch 2×2:
   *   H_AA = ε_A − 2t₂cos(ka)          (A–A a distanza a: secondi vicini)
   *   H_BB = ε_B − 2t₂cos(ka)
   *   H_AB = −t₁(1 + e^{−ika}) − t₃(e^{ika} + e^{−2ika})   (A–B a a/2 e 3a/2)
   *  Autovalori: E± = (H_AA+H_BB)/2 ± √[((H_AA−H_BB)/2)² + |H_AB|²]
   *  Al bordo di zona (ka = π) con solo primi vicini: gap = |ε_A − ε_B|. */
  function tbDiatomic(kr, a, epsA, epsB, orders) {
    const ka = Math.PI * kr;
    const t1 = orders[0] ? harrisonT(a / 2) : 0;
    const t2 = orders[1] ? harrisonT(a) : 0;
    const t3 = orders[2] ? harrisonT(1.5 * a) : 0;
    const HAA = epsA - 2 * t2 * Math.cos(ka);
    const HBB = epsB - 2 * t2 * Math.cos(ka);
    const re = -t1 * (1 + Math.cos(ka)) - t3 * (Math.cos(ka) + Math.cos(2 * ka));
    const im = t1 * Math.sin(ka) - t3 * (Math.sin(ka) - Math.sin(2 * ka));
    const mean = (HAA + HBB) / 2, half = (HAA - HBB) / 2;
    const root = Math.sqrt(half * half + re * re + im * im);
    return [mean - root, mean + root];
  }

  /** Estremi delle bande in funzione del passo reticolare: mostra come le bande
   *  si allargano (∝ t ∝ 1/a²) avvicinando gli atomi, partendo dai livelli atomici. */
  function tbBandsVsA({ mode, eps, epsA, epsB, orders, aMin, aMax, nA = 140, nK = 121 }) {
    const avals = [], bands = mode === 'mono' ? [{ min: [], max: [] }] : [{ min: [], max: [] }, { min: [], max: [] }];
    for (let i = 0; i < nA; i++) {
      const a = aMin + (aMax - aMin) * i / (nA - 1);
      avals.push(a);
      const mins = bands.map(() => Infinity), maxs = bands.map(() => -Infinity);
      for (let j = 0; j < nK; j++) {
        const kr = j / (nK - 1);
        const Es = mode === 'mono' ? [tbMono(kr, a, eps, orders)] : tbDiatomic(kr, a, epsA, epsB, orders);
        Es.forEach((E, b) => { mins[b] = Math.min(mins[b], E); maxs[b] = Math.max(maxs[b], E); });
      }
      bands.forEach((b, j) => { b.min.push(mins[j]); b.max.push(maxs[j]); });
    }
    return { a: avals, bands };
  }

  /* ---------------------------------------------------------------------------
   *  FONONI (catena masse-molle) — dove nascono "acustico" e "ottico"
   *   monoatomica: ω = 2√(K/M)|sin(ka/2)|
   *   biatomica  : ω² = K(1/M₁+1/M₂) ± K√[(1/M₁+1/M₂)² − 4sin²(ka/2)/(M₁M₂)]
   *  (Kittel, cap. 4). Restituisce frequenze ν = ω/2π in THz.
   * ------------------------------------------------------------------------- */
  function phononMono(kr, K, M) {
    const w = 2 * Math.sqrt(K / (M * CONST.AMU)) * Math.abs(Math.sin(Math.PI * kr / 2));
    return w / (2 * Math.PI) / 1e12;
  }
  function phononDiatomic(kr, K, M1, M2) {
    const m1 = M1 * CONST.AMU, m2 = M2 * CONST.AMU;
    const s = 1 / m1 + 1 / m2;
    const sn = Math.sin(Math.PI * kr / 2);
    const root = Math.sqrt(Math.max(0, s * s - 4 * sn * sn / (m1 * m2)));
    const wm = Math.sqrt(Math.max(0, K * (s - root))), wp = Math.sqrt(K * (s + root));
    return [wm / (2 * Math.PI) / 1e12, wp / (2 * Math.PI) / 1e12];
  }

  /* ===========================================================================
   * PSEUDOPOTENZIALE (Phillips-Kleinman + empty core di Ashcroft)
   *
   *  Lo stato di valenza vero ψ deve essere ortogonale agli stati di core |c⟩:
   *  per questo oscilla (ha nodi) vicino al nucleo. Phillips e Kleinman
   *  scrivono ψ = φ − Σ_c |c⟩⟨c|φ⟩ con φ liscia ("pseudo-funzione d'onda");
   *  φ soddisfa un'equazione con potenziale V_ps = V + V_R, dove V_R ≥ 0 è
   *  repulsivo nel core e cancella gran parte della buca coulombiana.
   *
   *  Qui:
   *   - stati di core 1s, 2s: idrogenoidi con Z_eff di Slater, ortonormalizzati
   *   - φ: orbitale di Slater 3s (r² e^{−ζr}, ζ = Z_eff/3a₀), reso liscio e
   *     senza nodi dentro r_c con un raccordo A + B r² (continuità di φ e φ')
   *   - ψ_AE = φ − Σ_c ⟨c|φ⟩|c⟩, poi normalizzata  ⇒ ha i 2 nodi del 3s
   *   - V vero: Coulomb schermato (illustrativo) −e²/r·[Z_v + (Z−Z_v)e^{−r/r_s}]
   *   - V_ps: "empty core" di Ashcroft: 0 per r < r_c, −Z_v e²/r fuori
   *     raggi r_c da N. W. Ashcroft, Phys. Lett. 23, 48 (1966)
   * ========================================================================= */
  const PSEUDO_ATOMS = {
    Na: { Z: 11, Zv: 1, rcBohr: 1.66, core: [10.70, 6.85], val: 2.20, label: 'Sodio  [Ne] 3s¹' },
    Mg: { Z: 12, Zv: 2, rcBohr: 1.39, core: [11.70, 7.85], val: 2.85, label: 'Magnesio  [Ne] 3s²' },
    Al: { Z: 13, Zv: 3, rcBohr: 1.12, core: [12.70, 8.85], val: 3.50, label: 'Alluminio  [Ne] 3s² 3p¹' }
  };

  function pseudoSystem(key, rMax = 7, n = 5000) {
    const P = PSEUDO_ATOMS[key];
    const a0 = CONST.BOHR, rc = P.rcBohr * a0, rs = rc / 2;
    const r = new Float64Array(n), dr = rMax / n;
    for (let i = 0; i < n; i++) r[i] = (i + 0.5) * dr;
    const dot = (f, g) => { let s = 0; for (let i = 0; i < n; i++) s += f[i] * g[i] * r[i] * r[i]; return s * dr; };
    const normalize = f => { const nn = Math.sqrt(dot(f, f)); for (let i = 0; i < n; i++) f[i] /= nn; return f; };

    // stati di core (parte radiale R(r))
    const c1 = normalize(r.map(x => Math.exp(-P.core[0] * x / a0)));
    const c2raw = r.map(x => { const rho = P.core[1] * x / a0; return (2 - rho) * Math.exp(-rho / 2); });
    const p12 = dot(c1, c2raw);
    const c2 = normalize(c2raw.map((v, i) => v - p12 * c1[i]));       // Gram-Schmidt

    // pseudo-funzione liscia
    const zeta = P.val / (3 * a0);
    const out = x => x * x * Math.exp(-zeta * x);
    const dOut = x => (2 * x - zeta * x * x) * Math.exp(-zeta * x);
    const Bc = dOut(rc) / (2 * rc), Ac = out(rc) - Bc * rc * rc;
    const phi = normalize(r.map(x => x < rc ? Ac + Bc * x * x : out(x)));

    // funzione d'onda "vera": si ortogonalizza ai core l'orbitale di Slater
    // non raccordato (coincide con φ fuori da r_c). Ortogonalizzare φ stessa
    // aggiungerebbe un nodo spurio vicino a r = 0 dovuto al raccordo A + B r².
    const sto = normalize(r.map(out));
    const o1 = dot(c1, sto), o2 = dot(c2, sto);
    const psi = normalize(sto.map((v, i) => v - o1 * c1[i] - o2 * c2[i]));
    if (psi[n - 1] * phi[n - 1] < 0) for (let i = 0; i < n; i++) psi[i] = -psi[i];

    // conteggio dei nodi (cambi di segno) per verifica
    let nodesAE = 0, nodesPS = 0;
    for (let i = 1; i < n; i++) { if (r[i] > 0.02 && psi[i] * psi[i - 1] < 0) nodesAE++; if (phi[i] * phi[i - 1] < 0) nodesPS++; }

    const Vtrue = x => -CONST.E2 / x * (P.Zv + (P.Z - P.Zv) * Math.exp(-x / rs));
    const Vps = x => x < rc ? 0 : -CONST.E2 * P.Zv / x;
    const interp = (f, x) => {
      const t = x / dr - 0.5; if (t <= 0) return f[0];
      const i = Math.floor(t); if (i >= n - 1) return f[n - 1];
      return f[i] + (t - i) * (f[i + 1] - f[i]);
    };
    return { P, rc, r, phi, psi, Vtrue, Vps, interp, nodesAE, nodesPS, overlap: [o1, o2] };
  }

  return {
    CONST, WAVELENGTHS, STRUCTURES, MATERIALS, PSEUDO_ATOMS,
    cellSites, closePackedSegments, packing, formFactor, geomStructureFactor, multiplicity,
    debyeWallerB, laueNodes, powderPattern,
    kpRHS, kpBands, freeElectronFolded, kpFermi,
    harrisonT, tbMono, tbDiatomic, tbBandsVsA, phononMono, phononDiatomic,
    pseudoSystem
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Physics;
