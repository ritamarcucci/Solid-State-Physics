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
   *            Diamante / blenda -> legame lungo ¼ della diagonale di corpo  r = a√3/8
   *    La blenda (zincblende, GaAs) ha gli stessi siti del diamante, ma i due
   *    sottoreticoli FCC sono occupati da specie diverse (siti 0-3 e 4-7).
   * ------------------------------------------------------------------------- */
  const FCC_BASIS = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
  const DIAMOND_BASIS = FCC_BASIS.concat(FCC_BASIS.map(p => p.map(x => x + 0.25)));
  const STRUCTURES = {
    sc:  { label: 'Cubico semplice (SC)', basis: [[0, 0, 0]], touch: 0.5, dirs: '⟨100⟩ (spigoli)' },
    bcc: { label: 'Cubico a corpo centrato (CCC / BCC)', basis: [[0, 0, 0], [0.5, 0.5, 0.5]], touch: Math.sqrt(3) / 4, dirs: '⟨111⟩ (diagonali di corpo)' },
    fcc: { label: 'Cubico a facce centrate (CFC / FCC)', basis: FCC_BASIS, touch: Math.sqrt(2) / 4, dirs: '⟨110⟩ (diagonali di faccia)' },
    diamond: { label: 'Diamante (CFC + base a ¼¼¼)', basis: DIAMOND_BASIS, touch: Math.sqrt(3) / 8, dirs: '⟨111⟩ (legami tetraedrici)' },
    zincblende: { label: 'Blenda di zinco (due specie)', basis: DIAMOND_BASIS, touch: Math.sqrt(3) / 8, dirs: '⟨111⟩ (legami tetraedrici)' }
  };
  // Fattore di impacchettamento ideale: APF = N·(4/3)π·touch³
  // (SC = π/6 ≈ 0.524, BCC = π√3/8 ≈ 0.680, FCC = π/(3√2) ≈ 0.740, diamante = π√3/16 ≈ 0.340)
  for (const s of Object.values(STRUCTURES)) {
    s.N = s.basis.length;
    s.apfIdeal = s.N * (4 / 3) * Math.PI * Math.pow(s.touch, 3);
  }

  /* ---------------------------------------------------------------------------
   * 3a. ELEMENTI — proprietà atomiche
   *  Z  : numero atomico     A : massa atomica [u]
   *  zv : elettroni di valenza dell'atomo usati da pseudopotenziale e bande
   *       (metalli di transizione e nobili: solo gli elettroni s)
   *  cm : coefficienti di Cromer-Mann del fattore di forma atomico
   *       f(s) = Σ aᵢ·exp(−bᵢ s²) + c,  s = sinθ/λ [Å⁻¹],  [a1,b1,a2,b2,a3,b3,a4,b4,c]
   *       (International Tables for Crystallography Vol. C, Tab. 6.1.1.4).
   *       Verifica: Σaᵢ + c ≈ Z (f a s = 0 conta tutti gli elettroni).
   * ------------------------------------------------------------------------- */
  const ELEMENTS = {
    C:  { Z: 6,  zv: 4, A: 12.011,  cm: [2.3100, 20.8439, 1.0200, 10.2075, 1.5886, 0.5687, 0.8650, 51.6512, 0.2156] },
    Be: { Z: 4,  zv: 2, A: 9.0122,  cm: [1.5919, 43.6427, 1.1278, 1.8623, 0.5391, 103.483, 0.7029, 0.5420, 0.0385] },
    Bi: { Z: 83, zv: 5, A: 208.980, cm: [33.3689, 0.7040, 12.9510, 2.9238, 16.5877, 8.7937, 6.4692, 48.0093, 13.5782] },
    Na: { Z: 11, zv: 1, A: 22.990,  cm: [4.7626, 3.2850, 3.1736, 8.8422, 1.2674, 0.3136, 1.1128, 129.424, 0.6760] },
    Mg: { Z: 12, zv: 2, A: 24.305,  cm: [5.4204, 2.8275, 2.1735, 79.2611, 1.2269, 0.3808, 2.3073, 7.1937, 0.8584] },
    Al: { Z: 13, zv: 3, A: 26.982,  cm: [6.4202, 3.0387, 1.9002, 0.7426, 1.5936, 31.5472, 1.9646, 85.0886, 1.1151] },
    Si: { Z: 14, zv: 4, A: 28.086,  cm: [6.2915, 2.4386, 3.0353, 32.3337, 1.9891, 0.6785, 1.5410, 81.6937, 1.1407] },
    Fe: { Z: 26, zv: 2, A: 55.845,  cm: [11.7695, 4.7611, 7.3573, 0.3072, 3.5222, 15.3535, 2.3045, 76.8805, 1.0369] },
    Ni: { Z: 28, zv: 2, A: 58.693,  cm: [12.8376, 3.8785, 7.2920, 0.2565, 4.4438, 12.1763, 2.3800, 66.3421, 1.0341] },
    Cu: { Z: 29, zv: 1, A: 63.546,  cm: [13.3380, 3.5828, 7.1676, 0.2470, 5.6158, 11.3966, 1.6735, 64.8126, 1.1910] },
    Ga: { Z: 31, zv: 3, A: 69.723,  cm: [15.2354, 3.0669, 6.7006, 0.2412, 4.3591, 10.7805, 2.9623, 61.4135, 1.7189] },
    Ge: { Z: 32, zv: 4, A: 72.630,  cm: [16.0816, 2.8509, 6.3747, 0.2516, 3.7068, 11.4468, 3.6830, 54.7625, 2.1313] },
    As: { Z: 33, zv: 5, A: 74.922,  cm: [16.6723, 2.6345, 6.0701, 0.2647, 3.4313, 12.9479, 4.2779, 47.7972, 2.5310] },
    Mo: { Z: 42, zv: 1, A: 95.95,   cm: [3.7025, 0.2772, 17.2356, 1.0958, 12.8876, 11.0040, 3.7429, 61.6584, 4.3875] },
    Ag: { Z: 47, zv: 1, A: 107.868, cm: [19.2808, 0.6446, 16.6885, 7.4726, 4.8045, 24.6605, 1.0463, 99.8156, 5.1790] },
    W:  { Z: 74, zv: 2, A: 183.84,  cm: [29.0818, 1.72029, 15.4300, 9.2259, 14.4327, 0.321703, 5.11982, 57.0560, 9.8875] },
    Au: { Z: 79, zv: 1, A: 196.967, cm: [16.8819, 0.4611, 18.5913, 8.6216, 25.5582, 1.4826, 5.8600, 36.3956, 12.0658] },
    Po: { Z: 84, zv: 6, A: 208.98,  cm: [34.6726, 0.700999, 15.4733, 3.55078, 13.1138, 9.55642, 7.02588, 47.0045, 13.6770] }
  };

  /* ---------------------------------------------------------------------------
   * 3b. DATABASE MATERIALI — UNICO PER TUTTI GLI STRUMENTI
   *
   *  group   : categoria mostrata nei menu a tendina (stesso elenco ovunque)
   *  species : elementi della base (per la blenda: [cationi, anioni])
   *  a       : costante reticolare a temperatura ambiente [Å]   (Kittel, cap. 1)
   *  rTab    : raggio tabulato [Å] — metallico CN12 per i metalli, covalente
   *            per i semiconduttori (Kittel / Greenwood-Earnshaw)
   *  thetaD  : temperatura di Debye [K]                      (Kittel, cap. 5)
   *  Tm      : temperatura di fusione [K]                    (CRC Handbook)
   *  valence : elettroni contati dal modello 1D di Kronig-Penney. Per i metalli
   *            semplici sono gli elettroni di valenza (Ashcroft-Mermin, Tab. 1.1);
   *            per i metalli di transizione solo gli elettroni s (le bande d
   *            non sono descritte da un modello a elettroni quasi liberi);
   *            per GaAs è la media per atomo (3+5)/2 = 4.
   *  epm     : chiave dei parametri di pseudopotenziale empirico (bande 3D)
   *  pseudo  : chiave dei parametri di empty core (strumento pseudopotenziale)
   *
   *  Nota sul raggio: il raggio CN=12 è un po' maggiore del raggio di contatto
   *  in una CCC (CN=8): correzione di Goldschmidt (~3%).
   * ------------------------------------------------------------------------- */
  const MATERIAL_GROUPS = [
    { id: 'fcc', label: 'Metalli CFC' },
    { id: 'bcc', label: 'Metalli CCC' },
    { id: 'semi', label: 'Semiconduttori' },
    { id: 'other', label: 'Altri casi didattici' },
    { id: 'semimetal', label: 'Semimetalli e materiali 2D' }
  ];
  const MATERIALS = {
    // ---- metalli CFC ----
    Cu:   { name: 'Rame',      group: 'fcc', species: ['Cu'], structure: 'fcc', a: 3.615, rTab: 1.28, thetaD: 343, Tm: 1358, valence: 1 },
    Al:   { name: 'Alluminio', group: 'fcc', species: ['Al'], structure: 'fcc', a: 4.050, rTab: 1.43, thetaD: 428, Tm: 933,  valence: 3, epm: 'Al', pseudo: 'Al' },
    Au:   { name: 'Oro',       group: 'fcc', species: ['Au'], structure: 'fcc', a: 4.078, rTab: 1.44, thetaD: 165, Tm: 1337, valence: 1 },
    Ag:   { name: 'Argento',   group: 'fcc', species: ['Ag'], structure: 'fcc', a: 4.086, rTab: 1.44, thetaD: 225, Tm: 1235, valence: 1 },
    Ni:   { name: 'Nichel',    group: 'fcc', species: ['Ni'], structure: 'fcc', a: 3.524, rTab: 1.24, thetaD: 450, Tm: 1728, valence: 2 },
    // ---- metalli CCC ----
    Fe:   { name: 'Ferro α',   group: 'bcc', species: ['Fe'], structure: 'bcc', a: 2.8665, rTab: 1.26, thetaD: 470, Tm: 1811, valence: 2 },
    W:    { name: 'Tungsteno', group: 'bcc', species: ['W'],  structure: 'bcc', a: 3.165, rTab: 1.39, thetaD: 400, Tm: 3695, valence: 2 },
    Mo:   { name: 'Molibdeno', group: 'bcc', species: ['Mo'], structure: 'bcc', a: 3.147, rTab: 1.40, thetaD: 450, Tm: 2896, valence: 1 },
    // ---- semiconduttori ----
    Si:   { name: 'Silicio',   group: 'semi', species: ['Si'], structure: 'diamond', a: 5.431, rTab: 1.175, thetaD: 645, Tm: 1687, valence: 4, epm: 'Si', expGap: 1.12 },
    Ge:   { name: 'Germanio',  group: 'semi', species: ['Ge'], structure: 'diamond', a: 5.658, rTab: 1.225, thetaD: 374, Tm: 1211, valence: 4, epm: 'Ge', expGap: 0.66 },
    // GaAs: Θ_D ≈ 344 K; rTab = media dei raggi covalenti di Ga e As
    GaAs: { name: 'Arseniuro di gallio', group: 'semi', species: ['Ga', 'As'], structure: 'zincblende', a: 5.653, rTab: 1.22, thetaD: 344, Tm: 1511, valence: 4, epm: 'GaAs', expGap: 1.42 },
    // ---- altri ----
    Na:   { name: 'Sodio (a 5 K)', group: 'other', species: ['Na'], structure: 'bcc', a: 4.225, rTab: 1.90, thetaD: 158, Tm: 371, valence: 1, pseudo: 'Na' },
    // α-Po: unico elemento cubico semplice. Θ_D non misurata in modo affidabile.
    Po:   { name: 'Polonio α', group: 'other', species: ['Po'], structure: 'sc', a: 3.359, rTab: 1.68, thetaD: null, Tm: 527, valence: 6 },
    // Mg è esagonale compatto: niente strumenti cubici, sì 1D e pseudopotenziale.
    Mg:   { name: 'Magnesio (hcp)', group: 'other', species: ['Mg'], structure: 'hcp', a: 3.209, c: 5.211, rTab: 1.60, thetaD: 400, Tm: 923, valence: 2, pseudo: 'Mg' },
    // Berillio: esagonale compatto con c/a = 1.568 (molto sotto l'ideale 1.633); Θ_D ≈ 1440 K (Kittel)
    Be:   { name: 'Berillio (hcp)', group: 'other', species: ['Be'], structure: 'hcp', a: 2.2856, c: 3.5832, rTab: 1.12, thetaD: 1440, Tm: 1560, valence: 2 },
    // Bismuto A7: romboedrico, 2 atomi/cella; costanti nella cella esagonale (a, c) e u = 0.234 (Kittel, Liu-Allen)
    Bi:   { name: 'Bismuto', group: 'semimetal', species: ['Bi'], structure: 'rhombohedral', a: 4.546, c: 11.862, rTab: 1.56, thetaD: 119, Tm: 544, valence: 5 },
    // Grafene: reticolo a nido d'ape, a = 2.46 Å (a_CC = 1.42 Å); Θ_D e fusione non definiti per il piano isolato
    Graphene: { name: 'Grafene (2D)', group: 'semimetal', species: ['C'], structure: 'honeycomb', a: 2.46, rTab: 0.77, thetaD: null, Tm: null, valence: 4 }
  };
  // Campi derivati: formula, Z e massa medi (usati da Debye-Waller e normalizzazioni),
  // fattore di forma della prima specie (compatibilità), alias rMetal.
  for (const [key, m] of Object.entries(MATERIALS)) {
    const els = m.species.map(s => ELEMENTS[s]);
    m.key = key;
    m.formula = m.species.join('');
    m.Z = els.reduce((s, e) => s + e.Z, 0) / els.length;
    m.A = els.reduce((s, e) => s + e.A, 0) / els.length;
    m.cm = els[0].cm;
    m.rMetal = m.rTab;
    // carattere elettrico REALE (3D, sperimentale): non dipende dal modello 1D
    m.character = m.group === 'semi' ? 'semiconduttore' : m.group === 'semimetal' ? 'semimetallo' : 'metallo';
  }
  const CUBIC = ['sc', 'bcc', 'fcc', 'diamond', 'zincblende'];

  /** Quali materiali ogni strumento sa trattare: true, oppure il motivo per cui no.
   *  L'elenco mostrato è sempre lo stesso; le voci non trattabili restano visibili
   *  ma disabilitate, con il motivo. */
  function supports(tool, key) {
    const m = MATERIALS[key];
    switch (tool) {
      case 'lattice': case 'ewald': case 'powder':
        return CUBIC.includes(m.structure) || ({ hcp: 'reticolo esagonale', rhombohedral: 'reticolo romboedrico (non cubico)', honeycomb: 'reticolo 2D a nido d\'ape' }[m.structure] || 'reticolo non cubico');
      case 'kp': case 'tb':
        return m.structure === 'rhombohedral' || m.structure === 'honeycomb' ? 'non è un cristallo 1D: usa Bande reali 3D' : true;
      case 'pseudo':
        return m.structure === 'rhombohedral' || m.structure === 'honeycomb' || key === 'Be'
          ? 'senza parametri di empty core: usa Bande reali 3D' : true;
      case 'bands3d':
        return true;   // sempre disponibili: dove mancano dati tabulati si usa un modello approssimato (segnalato a schermo)
      default: return true;
    }
  }

  /** Distanza tra primi vicini [Å] = 2·r_contatto (per hcp ideale coincide con a). */
  function nearestNeighbor(mat) {
    const s = STRUCTURES[mat.structure];
    return s ? 2 * s.touch * mat.a : mat.a;
  }

  /* ===========================================================================
   * CRISTALLOGRAFIA
   * ========================================================================= */

  /** Siti della cella convenzionale da disegnare, con il peso con cui ciascun
   *  atomo "appartiene" alla cella (vertice 1/8, faccia 1/2, centro 1). */
  const TETRA_SITES = [[.25, .25, .25], [.75, .75, .25], [.75, .25, .75], [.25, .75, .75]];
  function cellSites(structure) {
    const sites = [];
    for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1])
      sites.push({ p: [x, y, z], w: 1 / 8, kind: 'corner' });
    if (structure === 'bcc') sites.push({ p: [0.5, 0.5, 0.5], w: 1, kind: 'body' });
    const tetra = structure === 'diamond' || structure === 'zincblende';
    if (structure === 'fcc' || tetra) {
      for (const ax of [0, 1, 2]) for (const v of [0, 1]) {
        const p = [0.5, 0.5, 0.5]; p[ax] = v;
        sites.push({ p, w: 1 / 2, kind: 'face' });
      }
    }
    if (tetra) {            // 4 atomi interni nei siti tetraedrici (secondo sottoreticolo CFC)
      for (const p of TETRA_SITES) sites.push({ p, w: 1, kind: 'body' });
    }
    // specie: nella blenda il sottoreticolo interno è dell'anione (indice 1)
    for (const st of sites) st.species = (structure === 'zincblende' && st.kind === 'body') ? 1 : 0;
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
    } else if (structure === 'diamond' || structure === 'zincblende') {
      // 16 legami: ogni atomo interno è legato a 4 atomi del primo sottoreticolo
      // agli spostamenti (−,−,−)/4, (+,+,−)/4, (+,−,+)/4, (−,+,+)/4
      const off = [[-1, -1, -1], [1, 1, -1], [1, -1, 1], [-1, 1, 1]];
      for (const t of TETRA_SITES) for (const o of off)
        seg.push([t, t.map((v, i) => v + o[i] / 4)]);
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

  /** Fattore di forma atomico f(s) (Cromer-Mann) di un elemento, s = sinθ/λ. Per s=0 → ≈ Z. */
  function formFactorEl(el, s) {
    const c = el.cm;
    if (!c) return el.Z;
    const s2 = s * s;
    return c[0] * Math.exp(-c[1] * s2) + c[2] * Math.exp(-c[3] * s2) +
           c[4] * Math.exp(-c[5] * s2) + c[6] * Math.exp(-c[7] * s2) + c[8];
  }
  /** Fattore di forma della prima specie del materiale (compatibilità). */
  function formFactor(mat, s) { return formFactorEl(ELEMENTS[mat.species[0]], s); }

  /** Elemento che occupa ciascun sito della base.
   *  - blenda con due specie: siti 0-3 catione, 4-7 anione
   *  - struttura "ipotetica" scelta dall'utente: tutti i siti alla prima specie */
  function siteElements(mat, structure) {
    const els = mat.species.map(k => ELEMENTS[k]);
    return STRUCTURES[structure].basis.map((_, i) =>
      (structure === 'zincblende' && els.length > 1 && i >= 4) ? els[1] : els[0]);
  }

  /** Fattore di struttura completo:  F(hkl) = Σⱼ fⱼ(s)·exp[2πi(h xⱼ + k yⱼ + l zⱼ)].
   *  Con specie diverse le "estinzioni" del diamante diventano riflessioni
   *  deboli: in GaAs F(200) = 4(f_Ga − f_As) ≠ 0. */
  function structureFactor(mat, structure, h, k, l, s) {
    const basis = STRUCTURES[structure].basis, els = siteElements(mat, structure);
    let re = 0, im = 0;
    basis.forEach(([x, y, z], j) => {
      const f = formFactorEl(els[j], s);
      const ph = 2 * Math.PI * (h * x + k * y + l * z);
      re += f * Math.cos(ph); im += f * Math.sin(ph);
    });
    if (Math.abs(re) < 1e-9) re = 0;
    if (Math.abs(im) < 1e-9) im = 0;
    return { re, im, abs2: re * re + im * im };
  }
  /** Estinzione sistematica: F = 0 per ogni s (si valuta con fⱼ = Zⱼ). */
  function isExtinct(mat, structure, h, k, l) {
    const basis = STRUCTURES[structure].basis, els = siteElements(mat, structure);
    let re = 0, im = 0;
    basis.forEach(([x, y, z], j) => {
      const ph = 2 * Math.PI * (h * x + k * y + l * z);
      re += els[j].Z * Math.cos(ph); im += els[j].Z * Math.sin(ph);
    });
    return re * re + im * im < 1e-6;
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
      const extinct = isExtinct(mat, structure, h, k, l);
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
            const F = structureFactor(mat, structure, h, k, l, s);
            node.lit = true;
            node.lambda = lam;
            node.kout = kout;
            // ATTENZIONE: non usare node.k, che è l'indice di Miller k!
            // (in passato veniva sovrascritto da |k| = 2π/λ ≈ 15.96 Å⁻¹)
            node.kmag = kk;
            node.twoTheta = Math.acos(Math.min(1, (kout[0] * u[0] + kout[1] * u[1] + kout[2] * u[2]) / kk)) * CONST.DEG;
            node.I = F.abs2;                                      // |F|² (senza Lorentz-polarizzazione)
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
      if (isExtinct(mat, structure, h, k, l)) continue;   // estinzione sistematica
      const s = sinT / lambda;
      const F = structureFactor(mat, structure, h, k, l, s);
      const f = formFactor(mat, s);
      const m = multiplicity(h, k, l);
      const LP = (1 + Math.cos(2 * th) ** 2) / (sinT * sinT * Math.cos(th));
      const I0 = m * F.abs2 * LP;                  // senza Debye-Waller
      const DW = Math.exp(-2 * B * s * s);
      const bSize = K * lambda / (L * Math.cos(th));
      const bStrain = 4 * microstrain * Math.tan(th);
      const H = Math.sqrt(Hinst ** 2 + bSize ** 2 + bStrain ** 2) * CONST.DEG; // gradi
      const Hl = H + 4 * gradient * Math.tan(th) * CONST.DEG;
      peaks.push({ h, k, l, d, tt, m, F2: F.abs2, f, I0, I: I0 * DW, DW, H, Hl, Hr: H, bSizeDeg: bSize * CONST.DEG });
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
    const els = siteElements(mat, structure);
    const sumZ2 = els.reduce((q, e) => q + e.Z * e.Z, 0);
    for (let i = 0; i < n; i++) {
      const th = x[i] / 2 / CONST.DEG;
      const s = Math.sin(th) / lambda;
      // diffusione termica diffusa ∝ Σⱼ fⱼ² [1 − exp(−2Bs²)] (normalizzata a s = 0)
      const sumF2 = els.reduce((q, e) => q + formFactorEl(e, s) ** 2, 0);
      const tds = 40 * N / 4 * (sumF2 / sumZ2) * (1 - Math.exp(-2 * B * s * s));
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
  /*  Raggi di empty core TABULATI (Ashcroft 1966, in a₀). Per tutti gli altri
   *  materiali si usa l'approssimazione didattica r_c ≈ 0.4·r_atomico
   *  (verifica: Na 0.4·1.90 = 0.76 Å contro 0.88 Å tabulato; Al 0.57 contro 0.59)
   *  e lo strumento segnala che la curva è qualitativa. */
  const EMPTY_CORE_RC = { Na: 1.66, Mg: 1.39, Al: 1.12 };

  /* ---- Configurazione elettronica e regole di Slater ----------------------
   *  Il core si riempie in quest'ordine (gas nobili, poi d e f "interni"):
   *  così per Cu (Z−Z_v = 28) si ottiene [Ar]3d¹⁰, per W (72) [Xe]4f¹⁴5d⁴. */
  const CORE_ORDER = [[1, 's', 2], [2, 's', 2], [2, 'p', 6], [3, 's', 2], [3, 'p', 6], [3, 'd', 10],
    [4, 's', 2], [4, 'p', 6], [4, 'd', 10], [5, 's', 2], [5, 'p', 6], [4, 'f', 14], [5, 'd', 10]];
  const N_STAR = { 1: 1, 2: 2, 3: 3, 4: 3.7, 5: 4.0, 6: 4.2 };   // n efficace degli orbitali di Slater
  const periodOf = Z => Z <= 2 ? 1 : Z <= 10 ? 2 : Z <= 18 ? 3 : Z <= 36 ? 4 : Z <= 54 ? 5 : 6;
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sup = n => String(n).split('').map(c => SUP[c]).join('');

  /** Carica nucleare efficace (regole di Slater) per un elettrone s del
   *  gruppo (n s, n p), data la lista di sottogusci occupati [[n, l, occ], …]. */
  function slaterZeff(Z, shells, n) {
    let S = 0;
    for (const [m, l, occ] of shells) {
      if (m === n && (l === 's' || l === 'p')) S += (n === 1 ? 0.30 : 0.35) * occ;   // stesso gruppo
      else if (m === n - 1) S += 0.85 * occ;                                       // guscio n−1 (anche d)
      else if (m < n - 1) S += 1.00 * occ;                                         // gusci più interni
    }
    S -= (n === 1 ? 0.30 : 0.35);                                                   // non scherma sé stesso
    return Z - S;
  }

  /** Parametri dell'atomo per lo strumento pseudopotenziale, per QUALSIASI
   *  materiale del database (per i composti si usa il catione, prima specie). */
  function pseudoAtom(matKey) {
    const mat = MATERIALS[matKey];
    const sym = mat.species[0], el = ELEMENTS[sym];
    const Z = el.Z, Zv = el.zv, nv = periodOf(Z);
    // core
    let left = Z - Zv;
    const shells = [];
    for (const [n, l, cap] of CORE_ORDER) { if (left <= 0) break; const occ = Math.min(cap, left); shells.push([n, l, occ]); left -= occ; }
    // valenza: ns² np^(Zv−2) (oppure ns¹)
    const sOcc = Math.min(2, Zv), pOcc = Zv - sOcc;
    const all = shells.concat([[nv, 's', sOcc]], pOcc > 0 ? [[nv, 'p', pOcc]] : []);
    const coreS = [];
    for (let n = 1; n < nv; n++) coreS.push({ n, Zeff: slaterZeff(Z, all, n) });
    const val = slaterZeff(Z, all, nv);
    const tab = EMPTY_CORE_RC[sym] && mat.species.length === 1;
    const rcBohr = tab ? EMPTY_CORE_RC[sym] : 0.4 * mat.rTab / CONST.BOHR;
    // stringa della configurazione: gas nobile tra parentesi quadre + resto
    const noble = { 2: 'He', 10: 'Ne', 18: 'Ar', 36: 'Kr', 54: 'Xe' };
    let cnt = 0, cut = 0, gas = '';
    shells.forEach(([, , occ], i) => { cnt += occ; if (noble[cnt]) { gas = `[${noble[cnt]}]`; cut = i + 1; } });
    const restStr = shells.slice(cut).map(([n, l, occ]) => `${n}${l}${sup(occ)}`).join(' ');
    const valStr = `${nv}s${sup(sOcc)}${pOcc > 0 ? ` ${nv}p${sup(pOcc)}` : ''}`;
    return {
      Z, Zv, sym, rcBohr, nv, nStar: N_STAR[nv], coreS, val, approx: !tab,
      config: `${gas} ${restStr} ${valStr}`.replace(/\s+/g, ' ').trim(),
      core: coreS.map(c => +c.Zeff.toFixed(2)),
      label: `${mat.name}${mat.species.length > 1 ? ` (atomo di ${sym})` : ''}  ${gas} ${restStr} ${valStr}`.replace(/\s+/g, ' ')
    };
  }
  // compatibilità con il vecchio nome
  const PSEUDO_ATOMS = new Proxy({}, { get: (_, k) => (MATERIALS[k] ? pseudoAtom(k) : undefined) });

  /** Polinomio di Laguerre associato L_m^(1)(x) (parte radiale idrogenoide). */
  function laguerre1(m, x) {
    let s = 0, fact = 1;
    for (let k = 0; k <= m; k++) {
      if (k > 0) fact *= k;
      let binom = 1;                                       // C(m+1, m−k)
      for (let j = 1; j <= m - k; j++) binom = binom * (m + 1 - (m - k) + j) / j;
      s += (k % 2 ? -1 : 1) * binom * Math.pow(x, k) / fact;
    }
    return s;
  }

  /** Sistema pseudopotenziale per un materiale qualsiasi.
   *  Core: tutti gli stati ns con n < n_valenza (idrogenoidi con Z_eff di
   *  Slater, ortonormalizzati con Gram-Schmidt): sono gli unici a cui lo stato
   *  di valenza s deve essere ortogonale (stati con l diverso lo sono già). */
  function pseudoSystem(key, rMax = 7) {
    const P = pseudoAtom(key);
    const n = Math.round(4000 + 150 * P.Z);                // griglia più fitta per i nuclei pesanti
    const a0 = CONST.BOHR, rc = P.rcBohr * a0, rs = rc / 2;
    const r = new Float64Array(n), dr = rMax / n;
    for (let i = 0; i < n; i++) r[i] = (i + 0.5) * dr;
    const dot = (f, g) => { let s = 0; for (let i = 0; i < n; i++) s += f[i] * g[i] * r[i] * r[i]; return s * dr; };
    const normalize = f => { const nn = Math.sqrt(dot(f, f)); for (let i = 0; i < n; i++) f[i] /= nn; return f; };

    // stati di core ns: R_n0 ∝ e^{−ρ/n} L_{n−1}^(1)(2ρ/n), ρ = Z' r / a₀.
    // Slater per n ≥ 4 usa il numero quantico efficace n* < n: per dare
    // all'idrogenoide la stessa estensione dell'orbitale di Slater si usa
    // Z' = Z_eff·n²/n*² (⟨r⟩ ∝ n²/Z).
    const cores = [];
    for (const c of P.coreS) {
      const Zp = c.Zeff * (c.n * c.n) / (N_STAR[c.n] * N_STAR[c.n]);
      let f = r.map(x => { const rho = Zp * x / a0; return Math.exp(-rho / c.n) * laguerre1(c.n - 1, 2 * rho / c.n); });
      for (const q of cores) { const p = dot(q, f); f = f.map((v, i) => v - p * q[i]); }
      cores.push(normalize(f));
    }

    // pseudo-funzione liscia: orbitale di Slater r^{n*−1} e^{−ζr} raccordato con A + B r² dentro r_c
    const ns = P.nStar, zeta = P.val / (ns * a0);
    const out = x => Math.pow(x, ns - 1) * Math.exp(-zeta * x);
    const dOut = x => ((ns - 1) / x - zeta) * out(x);
    // raccordo φ_in = φ(r_c)·exp[β(r² − r_c²)]: stesso valore e stessa derivata in r_c,
    // positivo ovunque (quindi senza nodi) e con derivata nulla nell'origine
    const beta = dOut(rc) / (2 * rc * out(rc));
    const phi = normalize(r.map(x => x < rc ? out(rc) * Math.exp(beta * (x * x - rc * rc)) : out(x)));

    // funzione d'onda "vera" (Phillips-Kleinman): l'orbitale di Slater ortogonalizzato ai core
    const sto = normalize(r.map(out));
    const overlap = cores.map(c => dot(c, sto));
    const psi = normalize(sto.map((v, i) => v - cores.reduce((s, c, j) => s + overlap[j] * c[i], 0)));
    if (psi[n - 1] * phi[n - 1] < 0) for (let i = 0; i < n; i++) psi[i] = -psi[i];

    // nodi: si ignora la regione r < 2a₀/Z_1s, dove la funzione è dominata dalla
    // cuspide dell'1s e i cambi di segno sono artefatti del modello idrogenoide
    const rMin = 2 * a0 / (P.coreS.length ? P.coreS[0].Zeff : P.Z);
    let nodesAE = 0, nodesPS = 0;
    for (let i = 1; i < n; i++) { if (r[i] > rMin && psi[i] * psi[i - 1] < 0) nodesAE++; if (phi[i] * phi[i - 1] < 0) nodesPS++; }

    const Vtrue = x => -CONST.E2 / x * (P.Zv + (P.Z - P.Zv) * Math.exp(-x / rs));
    const Vps = x => x < rc ? 0 : -CONST.E2 * P.Zv / x;
    const interp = (f, x) => {
      const t = x / dr - 0.5; if (t <= 0) return f[0];
      const i = Math.floor(t); if (i >= n - 1) return f[n - 1];
      return f[i] + (t - i) * (f[i + 1] - f[i]);
    };
    return { P, rc, r, phi, psi, Vtrue, Vps, interp, nodesAE, nodesPS, nodesExpected: P.nv - 1, rMin, overlap, approx: P.approx };
  }

  /* ===========================================================================
   * SCHEMA A ZONA ESTESA (1D)
   *
   *  Nello schema ridotto ogni banda n vive in |k| ≤ π/a. Nello schema esteso
   *  la banda n occupa la n-esima zona di Brillouin: (n−1)π/a ≤ |k| ≤ nπ/a.
   *  Le bande dispari partono dal centro zona (minimo a k_r = 0), le pari dal
   *  bordo (minimo a k_r = 1), quindi con k_r = |k|a/π ∈ [0,1]:
   *     n dispari:  k_est = (n − 1) + k_r
   *     n pari   :  k_est =  n − k_r
   *  (in unità di π/a). Con V₀ → 0 si ritrova la parabola E = ħ²k²/2m intera.
   * ========================================================================= */
  function extendedK(kr, n) {
    return n % 2 === 1 ? (n - 1) + kr : n - kr;
  }

  /* ===========================================================================
   * BANDE REALI 3D — METODO DELLO PSEUDOPOTENZIALE EMPIRICO (EPM)
   *
   *  Funzioni d'onda sviluppate in onde piane: ψ_k = Σ_G c_G e^{i(k+G)·r}.
   *  Hamiltoniana (Rydberg, lunghezze in bohr):
   *     H_{G,G'} = |k+G|² δ_{GG'} + V(G−G')
   *  Per diamante/blenda, con l'origine nel centro del legame e τ = a(1,1,1)/8:
   *     V(q) = V_S(|q|²)·cos(q·τ) + i·V_A(|q|²)·sin(q·τ)
   *  V_S, V_A sono i fattori di forma simmetrico e antisimmetrico, diversi da
   *  zero solo per |q|² = 3, 4, 8, 11 (in unità di (2π/a)²).
   *  Parametri: M. L. Cohen e T. K. Bergstresser, Phys. Rev. 141, 789 (1966).
   *  Per l'alluminio (CFC, un atomo all'origine) bastano due coefficienti
   *  locali V(111), V(200) ricavati dalla superficie di Fermi:
   *  N. W. Ashcroft, Phil. Mag. 8, 2055 (1963).
   *  Accoppiamento spin-orbita trascurato (come nel lavoro originale).
   *  expGap: gap sperimentale a 300 K [eV] (Kittel, cap. 8), per confronto.
   * ========================================================================= */
  const RY = 13.6057;  // eV
  const EPM = {
    Si:   { a: 5.43, expGap: 1.12,  VS: { 3: -0.21, 8: 0.04, 11: 0.08 }, VA: {}, filled: 4 },
    Ge:   { a: 5.66, expGap: 0.66,  VS: { 3: -0.23, 8: 0.01, 11: 0.06 }, VA: {}, filled: 4 },
    GaAs: { a: 5.64, expGap: 1.42,  VS: { 3: -0.23, 8: 0.01, 11: 0.06 }, VA: { 3: 0.07, 4: 0.05, 11: 0.01 }, filled: 4 },
    Al:   { a: 4.05, lattice: 'fcc', local: { 3: 0.0179, 4: 0.0562 }, zv: 3 }
  };

  /* ---------------------------------------------------------------------------
   *  METALLI SENZA PARAMETRI TABULATI — modello semplificato
   *  Elettrone quasi libero sul reticolo vero del metallo, con il
   *  pseudopotenziale "empty core" di Ashcroft schermato alla Thomas-Fermi
   *  (unità atomiche di Rydberg: e² = 2, lunghezze in a₀):
   *      V(q) = − 8π Z_v cos(q r_c) / [Ω (q² + k_TF²)],   k_TF² = 4k_F/π
   *  Ω = volume atomico, k_F = (3π² Z_v/Ω)^{1/3}, r_c come nello strumento
   *  pseudopotenziale (tabulato per Na, Mg, Al; altrimenti 0.4·r_atomico).
   *  Verifica su Al: V(200) = 0.046 Ry contro 0.056 Ry del fit di Ashcroft.
   *  LIMITE: descrive solo la banda s(p) quasi libera. Nei metalli di
   *  transizione (Fe, Ni, W, Mo) e nobili (Cu, Ag, Au) mancano le bande d
   *  strette, che servirebbero un modello tight-binding spd o APW.
   *  Mg (esagonale) è approssimato con un CFC dello stesso volume atomico.
   * ------------------------------------------------------------------------- */
  function metalModel(matKey) {
    const mat = MATERIALS[matKey];
    let lattice = mat.structure, a = mat.a, note = '';
    if (lattice === 'hcp') {                               // CFC con lo stesso volume atomico
      const omega = Math.sqrt(3) / 2 * mat.a * mat.a * mat.c / 2;
      a = Math.cbrt(4 * omega); lattice = 'fcc';
      note = 'Struttura esagonale approssimata con un CFC dello stesso volume atomico.';
    }
    const el = ELEMENTS[mat.species[0]];
    const zv = el.zv;
    const abohr = a / CONST.BOHR;
    const omega = Math.pow(abohr, 3) / ({ fcc: 4, bcc: 2, sc: 1 }[lattice]);
    const kF = Math.cbrt(3 * Math.PI * Math.PI * zv / omega);
    const kTF2 = 4 * kF / Math.PI;
    const rc = (EMPTY_CORE_RC[mat.species[0]] && mat.species.length === 1) ? EMPTY_CORE_RC[mat.species[0]] : 0.4 * mat.rTab / CONST.BOHR;
    const unit = Math.pow(2 * Math.PI / abohr, 2);
    const localFn = q2 => {
      const q = Math.sqrt(q2 * unit);
      return -8 * Math.PI * zv * Math.cos(q * rc) / (omega * (q * q + kTF2));
    };
    const transition = ['Fe', 'Ni', 'Cu', 'Ag', 'Au', 'W', 'Mo'].includes(mat.species[0]);
    return { a, lattice, localFn, zv, rcBohr: rc, approx: true, transition, note };
  }

  /** Punti ad alta simmetria della zona di Brillouin CFC, in unità di 2π/a. */
  const BZ = {
    // CFC: L → Γ → X → W → K → Γ (percorso standard, continuo)
    fcc: { points: { L: [0.5, 0.5, 0.5], G: [0, 0, 0], X: [1, 0, 0], W: [1, 0.5, 0], U: [1, 0.25, 0.25], K: [0.75, 0.75, 0] },
           path: [['L', 'G', 'Λ'], ['G', 'X', 'Δ'], ['X', 'W', 'Z'], ['W', 'K', ''], ['K', 'G', 'Σ']] },
    // CCC: Γ → H → N → Γ → P → H
    bcc: { points: { G: [0, 0, 0], H: [0, 0, 1], N: [0.5, 0.5, 0], P: [0.5, 0.5, 0.5] },
           path: [['G', 'H', 'Δ'], ['H', 'N', 'G'], ['N', 'G', 'Σ'], ['G', 'P', 'Λ'], ['P', 'H', 'F']] },
    // SC: Γ → X → M → Γ → R → X
    sc:  { points: { G: [0, 0, 0], X: [0.5, 0, 0], M: [0.5, 0.5, 0], R: [0.5, 0.5, 0.5] },
           path: [['G', 'X', 'Δ'], ['X', 'M', 'Z'], ['M', 'G', 'Σ'], ['G', 'R', 'Λ'], ['R', 'X', 'S']] }
  };
  const BZ_POINTS = BZ.fcc.points, BZ_PATH = BZ.fcc.path;

  /** Vettori del reticolo reciproco con |G|² ≤ g2max, in unità di 2π/a
   *  (a = lato della cella CUBICA convenzionale):
   *   - CFC → reciproco CCC: indici tutti pari o tutti dispari
   *   - CCC → reciproco CFC: h + k + l pari
   *   - SC  → reciproco SC : tutti gli interi */
  function reciprocalGVectors(lattice, g2max) {
    const out = [], m = Math.ceil(Math.sqrt(g2max));
    for (let h = -m; h <= m; h++) for (let k = -m; k <= m; k++) for (let l = -m; l <= m; l++) {
      const par = [h, k, l].map(v => ((v % 2) + 2) % 2);
      if (lattice === 'fcc' && !(par[0] === par[1] && par[1] === par[2])) continue;
      if (lattice === 'bcc' && (h + k + l) % 2 !== 0) continue;
      if (h * h + k * k + l * l <= g2max) out.push([h, k, l]);
    }
    return out;
  }
  const fccGVectors = g2max => reciprocalGVectors('fcc', g2max);

  /** Autovalori di una matrice reale simmetrica n×n (array piatto, viene distrutto):
   *  riduzione di Householder a tridiagonale + algoritmo QL implicito
   *  (tred2 + tqli, Numerical Recipes cap. 11, versione "solo autovalori"). */
  function symEigenvalues(a, n) {
    const d = new Float64Array(n), e = new Float64Array(n);
    for (let i = n - 1; i > 0; i--) {
      const l = i - 1, ri = i * n;
      let h = 0, scale = 0;
      if (l > 0) {
        for (let k = 0; k <= l; k++) scale += Math.abs(a[ri + k]);
        if (scale === 0) e[i] = a[ri + l];
        else {
          for (let k = 0; k <= l; k++) { a[ri + k] /= scale; h += a[ri + k] * a[ri + k]; }
          let f = a[ri + l];
          let g = f >= 0 ? -Math.sqrt(h) : Math.sqrt(h);
          e[i] = scale * g; h -= f * g; a[ri + l] = f - g; f = 0;
          for (let j = 0; j <= l; j++) {
            const rj = j * n;
            g = 0;
            for (let k = 0; k <= j; k++) g += a[rj + k] * a[ri + k];
            for (let k = j + 1; k <= l; k++) g += a[k * n + j] * a[ri + k];
            e[j] = g / h; f += e[j] * a[ri + j];
          }
          const hh = f / (h + h);
          for (let j = 0; j <= l; j++) {
            const rj = j * n;
            f = a[ri + j]; g = e[j] - hh * f; e[j] = g;
            for (let k = 0; k <= j; k++) a[rj + k] -= (f * e[k] + g * a[ri + k]);
          }
        }
      } else e[i] = a[ri + l];
      d[i] = h;
    }
    for (let i = 0; i < n; i++) d[i] = a[i * n + i];
    // QL implicito sulla tridiagonale (d diagonale, e sottodiagonale)
    for (let i = 1; i < n; i++) e[i - 1] = e[i];
    e[n - 1] = 0;
    for (let l = 0; l < n; l++) {
      let iter = 0, m;
      do {
        for (m = l; m < n - 1; m++) {
          const dd = Math.abs(d[m]) + Math.abs(d[m + 1]);
          if (Math.abs(e[m]) <= 1e-15 * dd) break;
        }
        if (m !== l) {
          if (iter++ === 60) throw new Error('QL: troppe iterazioni');
          let g = (d[l + 1] - d[l]) / (2 * e[l]);
          let r = Math.hypot(g, 1);
          g = d[m] - d[l] + e[l] / (g + (g >= 0 ? Math.abs(r) : -Math.abs(r)));
          let s = 1, c = 1, p = 0, i;
          for (i = m - 1; i >= l; i--) {
            let f = s * e[i];
            const b = c * e[i];
            e[i + 1] = (r = Math.hypot(f, g));
            if (r === 0) { d[i + 1] -= p; e[m] = 0; break; }
            s = f / r; c = g / r; g = d[i + 1] - p; r = (d[i] - g) * s + 2 * c * b;
            d[i + 1] = g + (p = s * r); g = c * r - b;
          }
          if (r === 0 && i >= l) continue;
          d[l] -= p; e[l] = g; e[m] = 0;
        }
      } while (m !== l);
    }
    return Array.from(d).sort((x, y) => x - y);
  }

  /** Autovalori di H = |k+G|² + V(G−G') in un punto k (unità 2π/a), in eV. */
  function epmEigen(P, Gs, k, nBands) {
    const n = Gs.length, abohr = P.a / CONST.BOHR;
    const unit = Math.pow(2 * Math.PI / abohr, 2);           // (2π/a)² in Ry
    const complex = P.VA && Object.keys(P.VA).length > 0;   // blenda: H hermitiana complessa
    const N = complex ? 2 * n : n;
    const M = new Float64Array(N * N);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      let re = 0, im = 0;
      if (i === j) {
        const q = [k[0] + Gs[i][0], k[1] + Gs[i][1], k[2] + Gs[i][2]];
        re = unit * (q[0] * q[0] + q[1] * q[1] + q[2] * q[2]);
      } else {
        const q = [Gs[i][0] - Gs[j][0], Gs[i][1] - Gs[j][1], Gs[i][2] - Gs[j][2]];
        const q2 = q[0] * q[0] + q[1] * q[1] + q[2] * q[2];
        if (P.localFn) {
          re = P.localFn(q2);                                 // modello semplificato dei metalli
        } else if (P.local) {
          re = P.local[q2] || 0;                              // un atomo all'origine
        } else {
          const ph = Math.PI / 4 * (q[0] + q[1] + q[2]);      // q·τ con τ = (a/8)(1,1,1)
          re = (P.VS[q2] || 0) * Math.cos(ph);
          im = (P.VA[q2] || 0) * Math.sin(ph);
        }
      }
      if (complex) {
        // H = A + iB  →  matrice reale [[A, −B], [B, A]] con autovalori doppi
        M[i * N + j] = re; M[(i + n) * N + (j + n)] = re;
        M[i * N + (j + n)] = -im; M[(i + n) * N + j] = im;
      } else M[i * N + j] = re;
    }
    let ev = symEigenvalues(M, N);
    if (complex) ev = ev.filter((_, i) => i % 2 === 0);
    return ev.slice(0, nBands).map(x => x * RY);
  }

  /** Struttura a bande lungo il percorso standard (CFC: L-Γ-X-W-K-Γ).
   *  Restituisce x (ascissa del percorso), etichette dei punti, bande in eV
   *  con zero al massimo della banda di valenza (semiconduttori) o al livello
   *  di Fermi (Al), e l'analisi della gap. */
  function epmBands(matKey, { g2max = 19, step = 0.025, nBands } = {}) {
    // parametri: tabulati (Si, Ge, GaAs, Al) oppure modello semplificato dei metalli
    const mat = MATERIALS[matKey];
    const nc = bandsNonCubic(matKey, { g2max });
    if (nc) return nc;
    const P = mat && mat.epm ? Object.assign({ lattice: 'fcc' }, EPM[mat.epm]) : metalModel(matKey);
    const metal = !!(P.local || P.localFn);
    nBands = nBands || (metal ? 6 : 8);
    // stesso numero di onde piane per ogni reticolo: la densità dei punti G
    // (in unità di 2π/a) è 1/4 (CFC), 1/2 (CCC), 1 (SC), quindi il raggio di
    // taglio si scala come densità^(−1/3), cioè |G|²_max come densità^(−2/3)
    const scale = { fcc: 1, bcc: Math.pow(0.5, 2 / 3), sc: Math.pow(0.25, 2 / 3) }[P.lattice];
    const Gs = reciprocalGVectors(P.lattice, g2max * scale);
    const { points: PTS, path: PATH } = BZ[P.lattice];
    const lab = c => c === 'G' ? 'Γ' : c;
    const xs = [], ks = [], ticks = [], seg = [];
    let x = 0;
    PATH.forEach(([A, B, name], si) => {
      const pa = PTS[A], pb = PTS[B];
      const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
      const nseg = Math.max(2, Math.round(len / step));
      if (si === 0) ticks.push({ x, label: lab(A) });
      else if (A !== PATH[si - 1][1]) ticks[ticks.length - 1].label += ',' + lab(A);  // es. U,K
      for (let i = (si === 0 ? 0 : 1); i <= nseg; i++) {
        const t = i / nseg;
        ks.push([pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1]), pa[2] + t * (pb[2] - pa[2])]);
        xs.push(x + t * len); seg.push({ si, t, name, from: A, to: B });
      }
      x += len;
      ticks.push({ x, label: lab(B) });
    });
    const E = ks.map(k => epmEigen(P, Gs, k, nBands));
    const bands = Array.from({ length: nBands }, (_, b) => E.map(e => e[b]));

    let ref, info;
    if (metal) {
      // Metallo: livello di Fermi dell'elettrone libero con n = Z_v/Ω
      // (al primo ordine il potenziale debole non lo sposta: V(G=0) = 0)
      const atomsPerCell = { fcc: 4, bcc: 2, sc: 1 }[P.lattice];
      const n = P.zv * atomsPerCell / Math.pow(P.a, 3);
      const kF = Math.cbrt(3 * Math.PI * Math.PI * n);
      ref = CONST.HBAR2_2M * kF * kF;
      const crossing = bands.filter(b => Math.min(...b) < ref && Math.max(...b) > ref).length;
      // primi coefficienti di Fourier del potenziale, per il pannello
      const shells = [...new Set(Gs.map(g => g[0] * g[0] + g[1] * g[1] + g[2] * g[2]))].filter(q => q > 0).sort((p, q) => p - q).slice(0, 2)
        .map(q2 => ({ q2, V: P.localFn ? P.localFn(q2) : (P.local[q2] || 0) }));
      info = { metal: true, EF: 0, kF, crossing, shells, approx: !!P.approx, transition: !!P.transition, note: P.note || '' };
    } else {
      const vb = bands[P.filled - 1], cb = bands[P.filled];
      let iv = 0, ic = 0;
      vb.forEach((v, i) => { if (v > vb[iv]) iv = i; });
      cb.forEach((v, i) => { if (v < cb[ic]) ic = i; });
      ref = vb[iv];
      const where = i => {
        const s = seg[i];
        const near = (s.t < 1e-9 ? s.from : s.t > 1 - 1e-9 ? s.to : null);
        if (near) return near === 'G' ? 'Γ' : near;
        const from = s.from === 'G' ? 'Γ' : s.from, to = s.to === 'G' ? 'Γ' : s.to;
        return `${s.name || from + to} (${(s.t * 100).toFixed(0)}% da ${from} a ${to})`;
      };
      const kv = ks[iv], kc = ks[ic];
      const direct = Math.hypot(kv[0] - kc[0], kv[1] - kc[1], kv[2] - kc[2]) < 1e-6;
      // gap diretta minima (stesso k)
      let dmin = Infinity, id = 0;
      cb.forEach((c, i) => { if (c - vb[i] < dmin) { dmin = c - vb[i]; id = i; } });
      info = {
        metal: false, gap: cb[ic] - vb[iv], direct,
        vbm: { x: xs[iv], where: where(iv) }, cbm: { x: xs[ic], E: cb[ic] - ref, where: where(ic) },
        directGap: dmin, directAt: where(id)
      };
    }
    return { x: xs, ticks, seg, bands: bands.map(b => b.map(v => v - ref)), info, nG: Gs.length, P, lattice: P.lattice };
  }


  /* ===========================================================================
   * GEOMETRIA GENERALE, ZONA DI BRILLOUIN, BANDE NON CUBICHE
   *  - crystalGeometry(key): vettori primitivi, reciproci, punti ad alta
   *    simmetria (in Å⁻¹, coordinate cartesiane), percorso, e atomi/legami
   *    della cella da disegnare (usato dalla vista 3D delle bande);
   *  - brillouinZone(): cella di Wigner-Seitz del reticolo reciproco;
   *  - hcp (Be, Mg): onde piane con pseudopotenziale locale;
   *  - grafene: tight-binding π analitico;
   *  - Bi: tight-binding sp³ con spin-orbita (reticolo romboedrico A7).
   * ========================================================================= */
  const V3 = {
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    len: a => Math.hypot(a[0], a[1], a[2])
  };
  const frac2cart = (f, A) => [0, 1, 2].map(i => f[0] * A[0][i] + f[1] * A[1][i] + f[2] * A[2][i]);
  function recipOf(a1, a2, a3) {
    const f = 2 * Math.PI / V3.dot(a1, V3.cross(a2, a3));
    return [V3.mul(V3.cross(a2, a3), f), V3.mul(V3.cross(a3, a1), f), V3.mul(V3.cross(a1, a2), f)];
  }

  /* Parametri strutturali dei materiali non cubici */
  const BI_STRUCT = { a: 4.546, c: 11.862, u: 0.2340 };   // cella esagonale; atomi a ±u·c lungo l'asse trigonale
  /* Bi: tight binding sp³ + spin-orbita, 3 gusci di vicini (3.07, 3.53, 4.54 Å), stile Liu & Allen, PRB 52, 1566 (1995).
   * PROVENIENZA: i valori sono quelli ricordati dal lavoro originale; la Tabella II non è stata
   * scaricabile (HTTP 403), quindi NON sono verificati riga per riga sul testo. Come validazione
   * si sono usati tre dati sperimentali: sovrapposizione T–L (calcolo 36 meV, sperimentale ≈ 38 meV),
   * gap diretta in L (14 meV, ≈ 15 meV) e densità di portatori (3.4×10¹⁷ cm⁻³, ≈ 3×10¹⁷ cm⁻³). */
  const BI_TB = {            // eV
    Es: -10.906, Ep: -0.486, xi: 1.0,
    shells: [
      { Vss: -0.608, Vsp: 1.320, Vps: 1.320, Vpp: 1.854, Vpi: -0.600 },
      { Vss: -0.384, Vsp: 0.433, Vps: 0.433, Vpp: 1.396, Vpi: -0.344 },
      { Vss: 0.0,    Vsp: 0.0,   Vps: 0.0,   Vpp: 0.156, Vpi: 0.0 }
    ]
  };
  const GRAPHENE_TB = { t: 2.8, t2: 0.1 };     // eV: primi e secondi vicini (π)

  /** Descrizione geometrica del cristallo per la vista 3D e per i calcoli. */
  function crystalGeometry(key) {
    const mat = MATERIALS[key], st = mat.structure;
    const G = { key, structure: st, dim: 3, a: mat.a, atoms: [], cellEdges: [], bonds: true };
    const box = (o, v) => {                              // spigoli di un parallelepipedo
      const P = f => V3.add(o, frac2cart(f, v)), e = [];
      for (const [p, q] of [[[0,0,0],[1,0,0]],[[0,1,0],[1,1,0]],[[0,0,1],[1,0,1]],[[0,1,1],[1,1,1]],
        [[0,0,0],[0,1,0]],[[1,0,0],[1,1,0]],[[0,0,1],[0,1,1]],[[1,0,1],[1,1,1]],
        [[0,0,0],[0,0,1]],[[1,0,0],[1,0,1]],[[0,1,0],[0,1,1]],[[1,1,0],[1,1,1]]]) e.push([P(p), P(q)]);
      return e;
    };
    if (CUBIC.includes(st)) {
      const a = mat.a, h = a / 2;
      const lattice = (st === 'diamond' || st === 'zincblende') ? 'fcc' : st;
      G.lattice = lattice;
      G.a1 = lattice === 'fcc' ? [0, h, h] : lattice === 'bcc' ? [-h, h, h] : [a, 0, 0];
      G.a2 = lattice === 'fcc' ? [h, 0, h] : lattice === 'bcc' ? [h, -h, h] : [0, a, 0];
      G.a3 = lattice === 'fcc' ? [h, h, 0] : lattice === 'bcc' ? [h, h, -h] : [0, 0, a];
      const pts = Object.assign({}, BZ[lattice].points);
      if (lattice === 'fcc') pts.W = [1, 0.5, 0];
      G.points = {};
      for (const [k, v] of Object.entries(pts)) G.points[k] = V3.mul(v, 2 * Math.PI / a);
      G.path = BZ[lattice].path;
      G.atoms = cellSites(st).map(s => ({ p: V3.mul(s.p, a), species: s.species }));
      G.cellEdges = box([0, 0, 0], [[a, 0, 0], [0, a, 0], [0, 0, a]]);
      G.cellLabel = `cella cubica convenzionale, a = ${a} Å`;
    } else if (st === 'hcp') {
      const a = mat.a, c = mat.c, s3 = Math.sqrt(3);
      G.a1 = [a, 0, 0]; G.a2 = [-a / 2, a * s3 / 2, 0]; G.a3 = [0, 0, c];
      const B = recipOf(G.a1, G.a2, G.a3);
      const A = V3.mul(B[2], 0.5), M = V3.mul(B[0], 0.5), K = V3.mul(V3.add(B[0], B[1]), 1 / 3);
      G.points = { G: [0, 0, 0], M, K, A, L: V3.add(M, A), H: V3.add(K, A) };
      G.path = [['G', 'M', 'Σ'], ['M', 'K', 'T'], ['K', 'G', 'Σ'], ['G', 'A', 'Δ'], ['A', 'L', 'U'], ['L', 'H', 'P'], ['H', 'A', 'R']];
      // prisma esagonale: atomi a z = 0 (vertici + centro) e z = c/2 (tre atomi)
      const sites = [[0, 0, 0], [1 / 3, 2 / 3, 0.5]];
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = 0; k <= 1; k++) sites.forEach((s, si) => {
        const p = frac2cart([i + s[0], j + s[1], k + s[2]], [G.a1, G.a2, G.a3]);
        if (p[2] > c + 1e-6 || p[2] < -1e-6) return;
        if (Math.hypot(p[0], p[1]) <= a + 1e-6) G.atoms.push({ p, species: 0 });
      });
      const vx = [0, 1, 2, 3, 4, 5].map(i => [a * Math.cos(i * Math.PI / 3), a * Math.sin(i * Math.PI / 3)]);
      for (let i = 0; i < 6; i++) {
        const p = vx[i], q = vx[(i + 1) % 6];
        G.cellEdges.push([[p[0], p[1], 0], [q[0], q[1], 0]], [[p[0], p[1], c], [q[0], q[1], c]], [[p[0], p[1], 0], [p[0], p[1], c]]);
      }
      G.cellLabel = `prisma esagonale, a = ${a} Å, c = ${c} Å (c/a = ${(c / a).toFixed(3)})`;
    } else if (st === 'rhombohedral') {       // bismuto A7 (cella primitiva romboedrica)
      const { a, c, u } = BI_STRUCT, s3 = Math.sqrt(3);
      G.a1 = [-a / 2, -a / (2 * s3), c / 3]; G.a2 = [a / 2, -a / (2 * s3), c / 3]; G.a3 = [0, a / s3, c / 3];
      const B = recipOf(G.a1, G.a2, G.a3);
      const half = f => V3.mul(frac2cart(f, B), 0.5);
      G.points = { G: [0, 0, 0], T: half([1, 1, 1]), L: half([1, 0, 0]), X: half([1, 1, 0]) };
      G.path = [['T', 'G', 'Λ'], ['G', 'L', 'Σ'], ['L', 'X', ''], ['X', 'G', 'Δ']];
      const A = [G.a1, G.a2, G.a3];
      for (let i = -1; i <= 2; i++) for (let j = -1; j <= 2; j++) for (let k = -1; k <= 2; k++) for (const s of [1, -1]) {
        const f = [i + s * u, j + s * u, k + s * u];
        const inside = f.every(x => x > -1e-6 && x < 1 + 1e-6);
        const near = f.every(x => x > -0.5 && x < 1.5);
        if (near) G.atoms.push({ p: frac2cart(f, A), species: 0, ghost: !inside });
      }
      G.cellEdges = box([0, 0, 0], A);
      G.cellLabel = `cella primitiva romboedrica (A7), 2 atomi; asse trigonale ∥ z (atomi a ±u·c, u = ${u})`;
      G.bondMax = 3.3;
    } else if (st === 'honeycomb') {          // grafene: piano xy
      const a = mat.a, s3 = Math.sqrt(3);
      G.dim = 2; G.a1 = [a, 0, 0]; G.a2 = [-a / 2, a * s3 / 2, 0]; G.a3 = [0, 0, 10];
      const B = recipOf(G.a1, G.a2, G.a3);
      G.points = { G: [0, 0, 0], M: V3.mul(B[0], 0.5), K: V3.mul(V3.add(B[0], B[1]), 1 / 3) };
      G.path = [['G', 'M', 'Σ'], ['M', 'K', 'T'], ['K', 'G', 'Λ']];
      for (let i = -1; i <= 2; i++) for (let j = -1; j <= 2; j++) for (const t of [[1 / 3, 2 / 3], [2 / 3, 1 / 3]]) {
        G.atoms.push({ p: frac2cart([i + t[0], j + t[1], 0], [G.a1, G.a2, G.a3]), species: 0 });
      }
      G.cellEdges = [[[0, 0, 0], G.a1], [G.a1, V3.add(G.a1, G.a2)], [V3.add(G.a1, G.a2), G.a2], [G.a2, [0, 0, 0]]];
      G.cellLabel = `piano di grafene, a = ${a} Å (a_CC = ${(a / s3).toFixed(3)} Å)`;
      G.bondMax = a / s3 * 1.15;
    }
    G.recip = recipOf(G.a1, G.a2, G.a3);
    // legami: coppie a distanza ≈ primi vicini
    if (G.bonds) {
      const pos = G.atoms.map(t => t.p);
      let dmin = Infinity;
      for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) dmin = Math.min(dmin, V3.len(V3.sub(pos[i], pos[j])));
      const lim = G.bondMax || dmin * 1.05;
      G.bondList = [];
      for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
        const d = V3.len(V3.sub(pos[i], pos[j]));
        if (d < lim && d > 1e-6) G.bondList.push([i, j]);
      }
    }
    return G;
  }

  /** Cella di Wigner-Seitz del reticolo reciproco (prima zona di Brillouin).
   *  B: tre vettori reciproci cartesiani; dim = 2 → solo il piano xy.
   *  Restituisce { vertices, edges } con edges = coppie di punti cartesiani. */
  function brillouinZone(B, dim = 3) {
    const Gs = [], R = 2;
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (let k = (dim === 2 ? 0 : -R); k <= (dim === 2 ? 0 : R); k++) {
      if (!i && !j && !k) continue;
      Gs.push(frac2cart([i, j, k], B));
    }
    const pl = Gs.map(g => { const l = V3.len(g); return { n: V3.mul(g, 1 / l), d: l / 2 }; });
    const inside = x => pl.every(p => V3.dot(p.n, x) <= p.d + 1e-7);
    const verts = [];
    const push = x => { if (inside(x) && !verts.some(v => V3.len(V3.sub(v, x)) < 1e-6)) verts.push(x); };
    if (dim === 2) {
      for (let i = 0; i < pl.length; i++) for (let j = i + 1; j < pl.length; j++) {
        const A = pl[i], C = pl[j], det = A.n[0] * C.n[1] - A.n[1] * C.n[0];
        if (Math.abs(det) < 1e-9) continue;
        push([(A.d * C.n[1] - C.d * A.n[1]) / det, (A.n[0] * C.d - C.n[0] * A.d) / det, 0]);
      }
      const cx = verts.reduce((s, v) => s + v[0], 0) / verts.length, cy = verts.reduce((s, v) => s + v[1], 0) / verts.length;
      verts.sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
      return { vertices: verts, edges: verts.map((v, i) => [v, verts[(i + 1) % verts.length]]) };
    }
    for (let i = 0; i < pl.length; i++) for (let j = i + 1; j < pl.length; j++) {
      const c = V3.cross(pl[i].n, pl[j].n);
      if (V3.len(c) < 1e-9) continue;
      for (let k = j + 1; k < pl.length; k++) {
        const det = V3.dot(c, pl[k].n);
        if (Math.abs(det) < 1e-9) continue;
        const x = V3.mul(V3.add(V3.add(V3.mul(V3.cross(pl[j].n, pl[k].n), pl[i].d), V3.mul(V3.cross(pl[k].n, pl[i].n), pl[j].d)),
          V3.mul(c, pl[k].d)), 1 / det);
        push(x);
      }
    }
    // bordi: per ogni piano, i vertici che vi giacciono, ordinati per angolo
    const edges = [], seen = new Set();
    for (const p of pl) {
      const fv = verts.filter(v => Math.abs(V3.dot(p.n, v) - p.d) < 1e-6);
      if (fv.length < 3) continue;
      const cen = V3.mul(fv.reduce((s, v) => V3.add(s, v), [0, 0, 0]), 1 / fv.length);
      const e1 = V3.sub(fv[0], cen), e2 = V3.cross(p.n, e1);
      fv.sort((u, w) => Math.atan2(V3.dot(V3.sub(u, cen), e2), V3.dot(V3.sub(u, cen), e1)) - Math.atan2(V3.dot(V3.sub(w, cen), e2), V3.dot(V3.sub(w, cen), e1)));
      for (let i = 0; i < fv.length; i++) {
        const u = fv[i], w = fv[(i + 1) % fv.length];
        const key = [u, w].map(v => v.map(x => Math.round(x * 1e4)).join(',')).sort().join('|');
        if (!seen.has(key)) { seen.add(key); edges.push([u, w]); }
      }
    }
    return { vertices: verts, edges };
  }

  /** Percorso spezzato nello spazio k (cartesiano, Å⁻¹): ascissa x, k, etichette dei punti. */
  function buildKPath(points, path, nPerBZ) {
    const lab = c => c === 'G' ? 'Γ' : c;
    const xs = [], ks = [], ticks = [], seg = [];
    let x = 0;
    path.forEach(([A, Bp, name], si) => {
      const pa = points[A], pb = points[Bp], len = V3.len(V3.sub(pb, pa));
      const nseg = Math.max(4, Math.round(len * nPerBZ));
      if (si === 0) ticks.push({ x, label: lab(A) });
      else if (A !== path[si - 1][1]) ticks[ticks.length - 1].label += ',' + lab(A);
      for (let i = (si === 0 ? 0 : 1); i <= nseg; i++) {
        const t = i / nseg;
        ks.push(V3.add(pa, V3.mul(V3.sub(pb, pa), t)));
        xs.push(x + t * len); seg.push({ si, t, name, from: A, to: Bp });
      }
      x += len;
      ticks.push({ x, label: lab(Bp) });
    });
    return { xs, ks, ticks, seg };
  }
  const labelOf = (seg, i) => {
    const s = seg[i], near = (s.t < 1e-9 ? s.from : s.t > 1 - 1e-9 ? s.to : null);
    if (near) return near === 'G' ? 'Γ' : near;
    const f = s.from === 'G' ? 'Γ' : s.from, t = s.to === 'G' ? 'Γ' : s.to;
    return `${s.name || f + t} (${(s.t * 100).toFixed(0)}% da ${f} a ${t})`;
  };

  /* ---- hcp (Be, Mg): onde piane, pseudopotenziale empty core schermato ---- */
  function bandsHcp(matKey, { g2max = 19 } = {}) {
    const mat = MATERIALS[matKey], el = ELEMENTS[mat.species[0]], Z = el.zv;
    const geo = crystalGeometry(matKey), A = [geo.a1, geo.a2, geo.a3], B = geo.recip;
    const Oc = Math.abs(V3.dot(geo.a1, V3.cross(geo.a2, geo.a3))), Oa = Oc / 2;
    const kF = Math.cbrt(3 * Math.PI * Math.PI * Z / Oa), kTF2 = 4 * kF / (Math.PI * CONST.BOHR);
    const rc = (EMPTY_CORE_RC[mat.species[0]] ? EMPTY_CORE_RC[mat.species[0]] : 0.4 * mat.rTab / CONST.BOHR) * CONST.BOHR;   // Å
    const vAtom = q => -4 * Math.PI * Z * CONST.E2 / (Oa * (q * q + kTF2)) * Math.cos(q * rc);
    // inversione al centro del legame: τ = ±(a1 − a2)/6 + c/4
    const tau = V3.add(V3.mul(V3.sub(geo.a1, geo.a2), 1 / 6), V3.mul(geo.a3, 0.25));
    // stesso numero di onde piane del caso cubico
    const target = reciprocalGVectors('fcc', g2max).length;
    const cand = [];
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) for (let k = -6; k <= 6; k++) {
      const g = frac2cart([i, j, k], B); cand.push({ g, n2: V3.dot(g, g) });
    }
    cand.sort((p, q) => p.n2 - q.n2);
    const Gs = cand.slice(0, target).map(c => c.g), n = Gs.length;
    const Vtab = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const q = V3.sub(Gs[i], Gs[j]);
      Vtab[i * n + j] = vAtom(V3.len(q)) * Math.cos(V3.dot(q, tau));
    }
    const { xs, ks, ticks, seg } = buildKPath(geo.points, geo.path, 14);
    const nB = 8, E = ks.map(k => {
      const M = new Float64Array(Vtab);
      for (let i = 0; i < n; i++) { const q = V3.add(k, Gs[i]); M[i * n + i] = CONST.HBAR2_2M * V3.dot(q, q); }
      return symEigenvalues(M, n).slice(0, nB);
    });
    const bands = Array.from({ length: nB }, (_, b) => E.map(e => e[b]));
    const EF = CONST.HBAR2_2M * kF * kF;             // elettrone libero: n = Z/Ω_a
    const crossing = bands.filter(b => Math.min(...b) < EF && Math.max(...b) > EF).length;
    const shells = [...new Set(Gs.map(g => Math.round(V3.len(g) * 100) / 100))].filter(q => q > 0.01).sort((p, q) => p - q).slice(0, 3)
      .map(q => ({ label: `v<sub>atomo</sub>(q = ${q.toFixed(2)} Å⁻¹)`, V: vAtom(q), unit: 'eV' }));
    const info = { metal: true, hex: true, EF: 0, kF, crossing, shells, approx: true, transition: false,
      rc, note: 'Reticolo esagonale compatto vero (2 atomi per cella), potenziale locale.' };
    return { x: xs, ticks, seg, bands: bands.map(b => b.map(v => v - EF)), info, nG: n, P: { zv: Z, a: mat.a }, lattice: 'hcp', geo };
  }

  /* ---- grafene: π di primi (t) e secondi (t') vicini ---- */
  function bandsGraphene() {
    const geo = crystalGeometry('Graphene'), { t, t2 } = GRAPHENE_TB;
    const tauA = frac2cart([1 / 3, 2 / 3, 0], [geo.a1, geo.a2, geo.a3]);
    const del = [[0, 0], [-1, 0], [0, 1]].map(([i, j]) =>
      V3.sub(V3.add(frac2cart([2 / 3, 1 / 3, 0], [geo.a1, geo.a2, geo.a3]), V3.add(V3.mul(geo.a1, i), V3.mul(geo.a2, j))), tauA));
    const sec = [geo.a1, geo.a2, V3.sub(geo.a1, geo.a2)];
    const { xs, ks, ticks, seg } = buildKPath(geo.points, geo.path, 40);
    const up = [], dn = [];
    for (const k of ks) {
      let re = 0, im = 0;
      for (const d of del) { const ph = V3.dot(k, d); re += Math.cos(ph); im += Math.sin(ph); }
      const f2 = re * re + im * im;
      let g = 0;
      for (const s of sec) g += 2 * Math.cos(V3.dot(k, s));          // Σ cos su 6 secondi vicini
      const e2 = -t2 * g, f = Math.sqrt(f2);
      up.push(t * f + e2);
      dn.push(-t * f + e2);
    }
    // l'energia di Dirac (f = 0) vale e2(K); si porta a zero
    const iK = ks.reduce((b, k, i) => (V3.len(V3.sub(k, geo.points.K)) < V3.len(V3.sub(ks[b], geo.points.K)) ? i : b), 0);
    const ED = (up[iK] + dn[iK]) / 2;
    const bands = [dn.map(v => v - ED), up.map(v => v - ED)];
    const a_cc = geo.a / Math.sqrt(3);
    const vF = 1.5 * a_cc * t * 1.602176634e-19 / 1.054571817e-34 * 1e-10;   // m/s
    const iM = ks.reduce((b, k, i) => (V3.len(V3.sub(k, geo.points.M)) < V3.len(V3.sub(ks[b], geo.points.M)) ? i : b), 0);
    const info = { metal: false, dirac: true, gap: 0, direct: true, t, t2, vF, a_cc, EM: bands[1][iM], iK, xK: xs[iK], xM: xs[iM],
      vbm: { x: xs[iK], where: 'K (punto di Dirac)' }, cbm: { x: xs[iK], E: 0, where: 'K (punto di Dirac)' } };
    return { x: xs, ticks, seg, bands, info, nG: 0, P: { zv: 4, filled: 1 }, lattice: 'honeycomb', geo };
  }

  /* ---- bismuto: tight-binding sp³ + spin-orbita sull'A7 vero ---- */
  let _biCache = null;
  function biModel() {
    if (_biCache) return _biCache;
    const geo = crystalGeometry('Bi'), A = [geo.a1, geo.a2, geo.a3];
    const tau = [frac2cart([BI_STRUCT.u, BI_STRUCT.u, BI_STRUCT.u], A), frac2cart([-BI_STRUCT.u, -BI_STRUCT.u, -BI_STRUCT.u], A)];
    // tutti i vettori atomo i → atomo j (con traslazione) fino al 3° guscio
    const hops = [];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) for (let z = -3; z <= 3; z++) {
      const d = V3.add(V3.sub(tau[j], tau[i]), frac2cart([x, y, z], A)), L = V3.len(d);
      if (L > 1e-6 && L < 4.8) hops.push({ i, j, d, L });
    }
    // gusci per distanza: 1° ≈ 3.07 (A→B), 2° ≈ 3.53 (A→B), 3° ≈ 4.54 (A→A, stessa sottoreticolo)
    const Ls = [...new Set(hops.map(h => Math.round(h.L * 50) / 50))].sort((p, q) => p - q);
    hops.forEach(h => { h.shell = Ls.findIndex(l => Math.abs(l - Math.round(h.L * 50) / 50) < 1e-9); });
    _biCache = { geo, hops, Ls };
    return _biCache;
  }
  /** Autovalori (8 bande distinte, doppiamente degeneri per Kramers) in k cartesiano [Å⁻¹]. */
  function biEigen(m, k, TB) {
    const N = 16, Hr = new Float64Array(N * N), Hi = new Float64Array(N * N);
    const add = (r, c, re, im) => { Hr[r * N + c] += re; Hi[r * N + c] += im; };
    for (const h of m.hops) {
      const sh = TB.shells[h.shell]; if (!sh) continue;
      const c = [h.d[0] / h.L, h.d[1] / h.L, h.d[2] / h.L], ph = V3.dot(k, h.d), cr = Math.cos(ph), ci = Math.sin(ph);
      const T = [[sh.Vss, c[0] * sh.Vsp, c[1] * sh.Vsp, c[2] * sh.Vsp]];
      for (let a = 0; a < 3; a++) {
        const row = [-c[a] * sh.Vps];
        for (let b = 0; b < 3; b++) row.push(c[a] * c[b] * (sh.Vpp - sh.Vpi) + (a === b ? sh.Vpi : 0));
        T.push(row);
      }
      for (let o = 0; o < 4; o++) for (let p = 0; p < 4; p++) for (let s = 0; s < 2; s++) {
        const r = s * 8 + h.i * 4 + o, cc = s * 8 + h.j * 4 + p;
        add(r, cc, T[o][p] * cr, T[o][p] * ci);
      }
    }
    for (let at = 0; at < 2; at++) for (let s = 0; s < 2; s++) {
      add(s * 8 + at * 4, s * 8 + at * 4, TB.Es, 0);
      for (let p = 1; p < 4; p++) add(s * 8 + at * 4 + p, s * 8 + at * 4 + p, TB.Ep, 0);
    }
    // spin-orbita ξ L·S sugli orbitali p (base x, y, z)
    const h2 = TB.xi / 2;
    for (let at = 0; at < 2; at++) {
      const o = at * 4 + 1;                                     // indice di p_x
      const Lz = [[0, -1, 0], [1, 0, 0], [0, 0, 0]];            // parte immaginaria: L_z = i·Lz
      // elementi (parte immaginaria) di L_x, L_y, L_z
      const imLx = [[0, 0, 0], [0, 0, -1], [0, 1, 0]], imLy = [[0, 0, 1], [0, 0, 0], [-1, 0, 0]], imLz = Lz;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        // up-up: +L_z/2·ξ ; down-down: −L_z/2·ξ ; up-down: (L_x − i L_y)ξ/2 ; down-up: (L_x + i L_y)ξ/2
        add(o + a, o + b, 0, h2 * imLz[a][b]);
        add(8 + o + a, 8 + o + b, 0, -h2 * imLz[a][b]);
        // L_x = i·imLx ; −i·L_y = −i·(i·imLy) = imLy
        add(o + a, 8 + o + b, h2 * imLy[a][b], h2 * imLx[a][b]);
        // L_x + i L_y = i·imLx − imLy
        add(8 + o + a, o + b, -h2 * imLy[a][b], h2 * imLx[a][b]);
      }
    }
    // H = A + iB → [[A, −B], [B, A]]
    const M = new Float64Array(4 * N * N), W = 2 * N;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const re = Hr[r * N + c], im = Hi[r * N + c];
      M[r * W + c] = re; M[(r + N) * W + c + N] = re;
      M[r * W + c + N] = -im; M[(r + N) * W + c] = im;
    }
    const ev = symEigenvalues(M, W), out = [];
    for (let b = 0; b < 8; b++) out.push((ev[4 * b] + ev[4 * b + 1] + ev[4 * b + 2] + ev[4 * b + 3]) / 4);
    return out;
  }
  function bandsBi() {
    const m = biModel(), TB = BI_TB, geo = m.geo;
    const { xs, ks, ticks, seg } = buildKPath(geo.points, geo.path, 16);
    const E = ks.map(k => biEigen(m, k, TB));
    // livello di Fermi per neutralità di carica: 10 e⁻/cella = 5 bande piene (2 posti ciascuna).
    // Le tasche sono minuscole: si campionano finemente solo gli intorni di T (lacune) e L (elettroni).
    const nF = 5, Bv = geo.recip, pockets = [];
    const sampleBox = (c0, w, n) => {
      const out = [];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let l = 0; l < n; l++) {
        const f = [(i / (n - 1) - .5) * 2 * w, (j / (n - 1) - .5) * 2 * w, (l / (n - 1) - .5) * 2 * w];
        const k = V3.add(c0, frac2cart(f, Bv)); out.push(biEigen(m, k, TB));
      }
      return out;
    };
    const nS = 13, w = 0.05;
    const Tpts = sampleBox(geo.points.T, w, nS), Lpts = sampleBox(geo.points.L, w, nS);
    const vol = Math.pow(2 * w, 3) / (nS * nS * nS);        // frazione di zona per punto
    const countHoles = e => Tpts.reduce((s, ev) => s + (ev[nF - 1] > e ? 1 : 0), 0) * vol;
    const countElec = e => 3 * Lpts.reduce((s, ev) => s + (ev[nF] < e ? 1 : 0), 0) * vol;
    let lo = -1, hi = 1;
    for (let it = 0; it < 50; it++) { const mid = (lo + hi) / 2; (countElec(mid) - countHoles(mid) > 0 ? hi = mid : lo = mid); }
    const EF = (lo + hi) / 2;
    const bands = Array.from({ length: 8 }, (_, b) => E.map(e => e[b] - EF));
    // estremi: top banda 5ª (index 4) ovunque, fondo 6ª (index 5)
    const topV = Math.max(...bands[nF - 1]), botC = Math.min(...bands[nF]);
    const iT = bands[nF - 1].indexOf(topV), iL = bands[nF].indexOf(botC);
    const mid = geo.points;
    const eT = biEigen(m, mid.T, TB), eL = biEigen(m, mid.L, TB);
    const info = { metal: false, semimetal: true, EF: 0, overlap: topV - botC, Eh: topV, Ee: botC,
      EhAt: labelOf(seg, iT), EeAt: labelOf(seg, iL), gapL: eL[nF] - eL[nF - 1], gapT: eT[nF] - eT[nF - 1],
      nHoles: countHoles(EF), nElec: countElec(EF), shellDist: m.Ls.slice(0, 3),
      // densità di portatori (2 spin) in cm⁻³: stima grossolana, limitata dalla griglia fine attorno a T e L
      nCm3: 2 * 0.5 * (countHoles(EF) + countElec(EF)) / (Math.abs(V3.dot(geo.a1, V3.cross(geo.a2, geo.a3))) * 1e-24),
      vbm: { x: xs[iT], where: labelOf(seg, iT) }, cbm: { x: xs[iL], E: botC, where: labelOf(seg, iL) } };
    return { x: xs, ticks, seg, bands, info, nG: 0, P: { zv: 5, filled: 5 }, lattice: 'rhombohedral', geo };
  }

  /* ---- tight binding 3D cubico: un orbitale s per sito, hopping −t solo ai primi vicini ----
   *  E(k) = ε − t Σ_δ e^{ik·δ}, con k in unità 2π/a (a = costante della cella cubica convenzionale):
   *    SC  (6 vicini)  : ε − 2t [cos k_x a + cos k_y a + cos k_z a]
   *    BCC (8 vicini)  : ε − 8t cos(k_x a/2) cos(k_y a/2) cos(k_z a/2)
   *    FCC (12 vicini) : ε − 4t [cos(k_x a/2)cos(k_y a/2) + cos(k_y a/2)cos(k_z a/2) + cos(k_z a/2)cos(k_x a/2)]
   *  Bordi di banda in unità di t: SC ±6, BCC ±8, FCC da −12 a +4. Massa al fondo m* = ħ²/(2 t a²) per tutti e tre. */
  const TB3 = {
    sc:  { z: 6,  label: 'SC',  dOverA: 1,                w: [-6, 6] },
    bcc: { z: 8,  label: 'BCC', dOverA: Math.sqrt(3) / 2, w: [-8, 8] },
    fcc: { z: 12, label: 'FCC', dOverA: Math.SQRT1_2,     w: [-12, 4] }
  };
  function tbCubicE(lat, u, eps, t) {
    const c = x => Math.cos(2 * Math.PI * x), h = x => Math.cos(Math.PI * x);
    if (lat === 'sc') return eps - 2 * t * (c(u[0]) + c(u[1]) + c(u[2]));
    if (lat === 'bcc') return eps - 8 * t * h(u[0]) * h(u[1]) * h(u[2]);
    return eps - 4 * t * (h(u[0]) * h(u[1]) + h(u[1]) * h(u[2]) + h(u[2]) * h(u[0]));
  }
  /** Banda lungo il percorso ad alta simmetria del reticolo (SC, BCC o FCC). */
  function tbCubicBands(lat, eps, t, nPerBZ = 60) {
    const { points, path } = BZ[lat];
    const { xs, ks, ticks } = buildKPath(points, path, nPerBZ);
    const E = ks.map(u => tbCubicE(lat, u, eps, t));
    return { x: xs, E, ticks, Emin: Math.min(...E), Emax: Math.max(...E) };
  }

  /** Bande cubiche: bande che si trovano
  /** Bande dei materiali non cubici; null se il materiale è cubico. */
  function bandsNonCubic(matKey, opt) {
    const st = MATERIALS[matKey].structure;
    if (st === 'hcp') return bandsHcp(matKey, opt);
    if (st === 'honeycomb') return bandsGraphene();
    if (st === 'rhombohedral') return bandsBi();
    return null;
  }

  return {
    CONST, WAVELENGTHS, STRUCTURES, ELEMENTS, MATERIALS, MATERIAL_GROUPS, PSEUDO_ATOMS, EPM,
    supports, nearestNeighbor,
    cellSites, closePackedSegments, packing, formFactor, formFactorEl, geomStructureFactor,
    structureFactor, isExtinct, multiplicity,
    debyeWallerB, laueNodes, powderPattern,
    kpRHS, kpBands, freeElectronFolded, kpFermi, extendedK,
    harrisonT, tbMono, tbDiatomic, tbBandsVsA, phononMono, phononDiatomic,
    pseudoSystem, pseudoAtom, epmBands, metalModel, symEigenvalues,
    crystalGeometry, brillouinZone, bandsNonCubic, biEigen, biModel, BI_TB, GRAPHENE_TB,
    TB3, tbCubicE, tbCubicBands
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Physics;
