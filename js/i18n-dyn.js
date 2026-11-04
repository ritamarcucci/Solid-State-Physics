/* =============================================================================
 *  i18n-dyn.js — traduzioni inglesi dei testi generati da main.js / physics.js
 *  (etichette dei pannelli dati, badge, avvisi, nomi dei materiali, grafici).
 *  Chiave = testo italiano normalizzato; le frasi con numeri usano le regole.
 * ============================================================================= */
(() => {
  'use strict';
  const I = I18N;

  /* ---- materiali (Physics.MATERIALS.name) e nomi in minuscolo per le frasi ---- */
  const NAMES = {
    'Rame': 'Copper', 'Alluminio': 'Aluminium', 'Oro': 'Gold', 'Argento': 'Silver', 'Nichel': 'Nickel',
    'Ferro α': 'Iron α', 'Tungsteno': 'Tungsten', 'Molibdeno': 'Molybdenum', 'Silicio': 'Silicon',
    'Germanio': 'Germanium', 'Arseniuro di gallio': 'Gallium arsenide', 'Sodio (a 5 K)': 'Sodium (at 5 K)',
    'Polonio α': 'Polonium α', 'Magnesio (hcp)': 'Magnesium (hcp)', 'Berillio (hcp)': 'Beryllium (hcp)',
    'Bismuto': 'Bismuth', 'Grafene (2D)': 'Graphene (2D)'
  };
  I.add(NAMES);
  const lower = {};
  for (const [k, v] of Object.entries(NAMES)) lower[k.toLowerCase()] = v.toLowerCase().replace(/ \(.*\)$/, '');
  const nm = s => NAMES[s] || s;
  const nml = s => lower[s] || s;
  const T = s => I.t(s);

  /* ---- gruppi, strutture, motivi di non disponibilità ---- */
  I.add({
    'Metalli CFC': 'FCC metals', 'Metalli CCC': 'BCC metals', 'Semiconduttori': 'Semiconductors',
    'Altri casi didattici': 'Other teaching cases', 'Semimetalli e materiali 2D': 'Semimetals and 2D materials',
    'Cubico semplice (SC)': 'Simple cubic (SC)', 'Cubico a corpo centrato (CCC / BCC)': 'Body-centred cubic (BCC)',
    'Cubico a facce centrate (CFC / FCC)': 'Face-centred cubic (FCC)', 'Diamante (CFC + base a ¼¼¼)': 'Diamond (FCC + basis at ¼¼¼)',
    'Blenda di zinco (due specie)': 'Zinc blende (two species)',
    '⟨100⟩ (spigoli)': '⟨100⟩ (edges)', '⟨111⟩ (diagonali di corpo)': '⟨111⟩ (body diagonals)',
    '⟨110⟩ (diagonali di faccia)': '⟨110⟩ (face diagonals)', '⟨111⟩ (legami tetraedrici)': '⟨111⟩ (tetrahedral bonds)',
    'reticolo esagonale': 'hexagonal lattice', 'reticolo romboedrico (non cubico)': 'rhombohedral (non-cubic) lattice',
    "reticolo 2D a nido d'ape": '2D honeycomb lattice', 'reticolo non cubico': 'non-cubic lattice',
    'non è un cristallo 1D: usa Bande reali 3D': 'not a 1D crystal: use Real bands 3D',
    'senza parametri di empty core: usa Bande reali 3D': 'no empty-core parameters: use Real bands 3D',
    'Struttura esagonale approssimata con un CFC dello stesso volume atomico.': 'Hexagonal structure approximated by an FCC of the same atomic volume.',
    'Reticolo esagonale compatto vero (2 atomi per cella), potenziale locale.': 'True hexagonal close-packed lattice (2 atoms per cell), local potential.',
    'CFC': 'FCC', 'CCC': 'BCC', 'esagonale compatta': 'hexagonal close-packed', 'romboedrica (A7)': 'rhombohedral (A7)',
    "nido d'ape 2D": '2D honeycomb', 'cubica': 'cubic'
  });

  /* ---- navigazione ---- */
  I.add({
    'Modulo 1': 'Module 1', 'Modulo 2': 'Module 2',
    'Cristallografia e Diffrattometria': 'Crystallography and Diffractometry', 'Bande Cristalline e Modelli': 'Crystal Bands and Models',
    'Costruttore di reticoli': 'Lattice builder', 'Fattore di impacchettamento': 'Packing fraction',
    'Ponte reale ↔ reciproco': 'Real ↔ reciprocal bridge', 'Sfera di Ewald e Laue': 'Ewald sphere and Laue',
    'Stanza dei raggi X': 'X-ray room', 'Polveri, Scherrer, Debye-Waller': 'Powders, Scherrer, Debye-Waller',
    'Top-down': 'Top-down', 'Quasi libero e Kronig-Penney': 'Nearly free and Kronig-Penney', 'Bottom-up': 'Bottom-up',
    'Il trucco del nucleo': 'The core trick', 'Pseudopotenziale': 'Pseudopotential', 'Bande reali 3D': 'Real bands 3D',
    'Si, Ge, GaAs, Al, Be, Bi, grafene: L, Γ, X, W, K': 'Si, Ge, GaAs, Al, Be, Bi, graphene: L, Γ, X, W, K',
    'Nessun testo per questo strumento.': 'No text for this tool.', 'Teoria': 'Theory'
  });

  /* ---- voci dei menu dei materiali: "Nome (Formula) — STRUTTURA [· non disponibile: motivo]" ---- */
  I.rule(/^(.+) \(([A-Za-z0-9]+)\) — ([A-Z0-9]+)(?: · non disponibile: (.+))?$/,
    m => `${nm(m[1])} (${m[2]}) — ${m[3]}${m[4] ? ' · not available: ' + T(m[4]) : ''}`);
  I.add({
    'Angolo 2θ': 'Angle 2θ', 'indici di Miller': 'Miller indices', 'angolo di diffrazione 2θ, in gradi': 'diffraction angle 2θ, in degrees',
    'distanza tra i piani reticolari': 'distance between lattice planes', 'molteplicità: quanti piani equivalenti': 'multiplicity: how many equivalent planes',
    'fattore di struttura al quadrato': 'structure factor squared', 'fattore di Debye-Waller e^(−2Bs²)': 'Debye-Waller factor e^(−2Bs²)',
    'intensità relativa al picco più forte': 'intensity relative to the strongest peak', 'picco più intenso': 'strongest peak'
  });

  I.add({
    'raggi sfere': 'sphere radii', 'nodi estinti (|h|,|k|,|l| ≤ 3)': 'extinct nodes (|h|,|k|,|l| ≤ 3)',
    'Z nucleo / Z valenza': 'Z nucleus / Z valence', 'configurazione': 'configuration', 'ψ vs φ a r = 2 Å': 'ψ vs φ at r = 2 Å',
    'Fononi · catena biatomica': 'Phonons · diatomic chain', 'Fononi · catena monoatomica': 'Phonons · monatomic chain',
    'Pseudopotenziale · φ senza nodi': 'Pseudopotential · φ without nodes',
    'ramo acustico': 'acoustic branch', 'ramo ottico': 'optical branch', 'ψ vera': 'true ψ', 'V_R (repulsivo)': 'V_R (repulsive)',
    'φ pseudo-funzione': 'φ pseudo-function', "ψ funzione d'onda": 'ψ wave function'
  });

  /* ---- costruttore di reticoli ---- */
  I.add({
    'N atomi / cella': 'N atoms / cell', 'r attuale': 'current r', 'r di contatto': 'contact r',
    'scarto tab./contatto': 'tab./contact difference', 'V cella = a³': 'V cell = a³', 'V sfere = N·4πr³/3': 'V spheres = N·4πr³/3',
    'APF': 'APF', '● bloccato': '● locked'
  });
  I.rule(/^a \((.+)\)$/, m => `a (${nm(m[1])})`);
  I.rule(/^r tabulato \((covalente|CN 12)\)$/, m => `tabulated r (${m[1] === 'covalente' ? 'covalent' : 'CN 12'})`);
  I.rule(/^APF ideale (.+)$/, m => `Ideal APF ${m[1]}`);
  I.rule(/^Sfere tangenti lungo (.+): evidenziate in giallo\.$/, m => `Spheres tangent along ${T(m[1])}: highlighted in yellow.`);
  I.rule(/^Contatto · APF = ([\d.]+) · (.+)$/, m => `Contact · APF = ${m[1]} · ${T(m[2])}`);
  I.rule(/^Struttura reale del (.+)\.$/, m => `Real structure of ${nml(m[1])}.`);
  I.rule(/^Struttura ipotetica: il (.+) reale è (\w+)\. La costante a resta quella sperimentale\.$/,
    m => `Hypothetical structure: real ${nml(m[1])} is ${m[2]}. The constant a stays the experimental one.`);

  /* ---- Ewald / Laue ---- */
  I.rule(/^(\d+) nodi in condizione di Laue · (\d+) macchie sul rivelatore$/, m => `${m[1]} nodes satisfying the Laue condition · ${m[2]} spots on the detector`);
  I.add({
    'Nessun nodo tra le due sfere: ruota il cristallo o allarga lo spettro.': 'No node between the two spheres: rotate the crystal or widen the spectrum.'
  });

  /* ---- polveri ---- */
  I.add({
    'Intensità (u.a.)': 'Intensity (a.u.)', 'Intensità (u.a., log)': 'Intensity (a.u., log)', '2θ (gradi)': '2θ (degrees)',
    'B(T) Debye-Waller': 'B(T) Debye-Waller', 'non disponibile': 'not available', 'n.d.': 'n.a.',
    'picco più intenso': 'strongest peak', 'FWHM da Scherrer': 'FWHM from Scherrer', 'FWHM totale': 'total FWHM',
    'Dilatazione termica non inclusa: i picchi non si spostano con T.': 'Thermal expansion not included: the peaks do not shift with T.',
    'nessuna estinzione': 'no extinctions', 'h+k+l dispari estinti': 'h+k+l odd extinct', 'indici misti estinti': 'mixed indices extinct',
    'misti e h+k+l=4n+2 estinti': 'mixed and h+k+l=4n+2 extinct',
    'Θ_D del Po non è misurata in modo affidabile: effetto termico disattivato.': 'Θ_D of Po is not reliably measured: thermal effect disabled.',
    'Sopra 1185 K il ferro reale passa alla fase γ (FCC).': 'Above 1185 K real iron changes to the γ (FCC) phase.',
    'Cu Kα₁ — 1.5406 Å': 'Cu Kα₁ — 1.5406 Å'
  });
  I.rule(/^(.+) · (SC|BCC|FCC|DIAMOND) · (.+)$/, m => `${nm(m[1])} · ${m[2]} · ${T(m[3])}`);
  I.rule(/^T ≥ T_fusione \((\d+) K\): un campione reale sarebbe liquido e mostrerebbe solo aloni diffusi\.$/, m => `T ≥ T_melting (${m[1]} K): a real sample would be liquid and would show only diffuse halos.`);
  I.rule(/^(\d+) nm$/, m => `${m[1]} nm`);

  /* ---- top-down (Kronig-Penney) ---- */
  I.add({
    'k (π/a) — 1ª zona di Brillouin': 'k (π/a) — 1st Brillouin zone', 'k (π/a) — schema a zona estesa': 'k (π/a) — extended-zone scheme',
    'elettrone libero + V̄': 'free electron + V̄', 'elettrone libero + V̄ (ripiegato)': 'free electron + V̄ (folded)',
    'V₀ = 0 · parabola libera ripiegata': 'V₀ = 0 · folded free parabola',
    'E libera al bordo zona': 'free E at zone edge', 'esatto': 'exact', 'carattere (1D)': 'character (1D)', 'modello 1D': '1D model',
    'banda a metà → metallo': 'half-filled band → metal', 'bande che si toccano → metallo': 'bands touching → metal',
    'semiconduttore': 'semiconductor', 'metallo': 'metal', 'semimetallo': 'semimetal', 'isolante': 'insulator',
    'fuori scala': 'off scale', 'E_F': 'E_F',
    'Con V₀ ≈ 0 il modello non ha gap: aumenta V₀ per aprirlo. Il materiale reale ha il gap sperimentale indicato (è un semiconduttore, non un isolante).':
      'With V₀ ≈ 0 the model has no gap: increase V₀ to open it. The real material has the experimental gap shown (it is a semiconductor, not an insulator).',
    'Il gap del modello dipende da V₀ e a (sliders), non è quello del materiale: il valore reale è quello sperimentale.':
      'The model gap depends on V₀ and a (sliders); it is not the material gap: the real value is the experimental one.',
    'In 1D un numero pari di elettroni riempie bande intere; nel cristallo 3D le bande si sovrappongono in energia e il materiale resta un metallo.':
      'In 1D an even number of electrons fills whole bands; in the 3D crystal the bands overlap in energy and the material remains a metal.'
  });
  I.rule(/^(\d+) gap aperti$/, m => `${m[1]} open gap${m[1] === '1' ? '' : 's'}`);
  I.rule(/^gap (\d+): ([\d.]+) eV$/, m => `gap ${m[1]}: ${m[2]} eV`);
  I.rule(/^banda (\d+)$/, m => `band ${m[1]}`);
  I.rule(/^bande piene, gap ([\d.]+) eV$/, m => `filled bands, gap ${m[1]} eV`);
  I.rule(/^semiconduttore \(gap ([\d.]+) eV\)$/, m => `semiconductor (gap ${m[1]} eV)`);
  I.rule(/^(.+) reale \(3D\)$/, m => `${nm(m[1])} real (3D)`);
  I.rule(/^(.+): Z_v$/, m => `${nm(m[1])}: Z_v`);
  I.rule(/^(\d+) e⁻\/cella$/, m => `${m[1]} e⁻/cell`);
  I.rule(/^gap \(k=(.+)\)$/, m => `gap (k=${m[1]})`);
  I.rule(/^(\d) \(k=(.+)\)$/, m => `${m[1]} (k=${m[2]})`);

  /* ---- tight binding ---- */
  I.add({
    'banda inferiore': 'lower band', 'banda superiore': 'upper band', 'banda sup.': 'upper band', 'banda inf.': 'lower band', 'banda': 'band',
    'solo t₁': 't₁ only', '4t₁ (solo primi vicini)': '4t₁ (nearest neighbours only)', 'gap (bordo zona)': 'gap (zone edge)', 'estensione totale': 'total width',
    'passo a (Å)': 'spacing a (Å)', 'acustico max (k=π/a)': 'acoustic max (k=π/a)', 'ottico min (k=π/a)': 'optical min (k=π/a)',
    'ottico max (k=0)': 'optical max (k=0)', 'acustico': 'acoustic', 'ottico': 'optical',
    'Con una sola banda lo schema esteso coincide con quello ridotto.': 'With a single band the extended scheme coincides with the reduced one.',
    'Hopping di Harrison: |V_ssσ| = 1.40·ħ²/(m d²) = 10.67/d² eV·Å².': 'Harrison hopping: |V_ssσ| = 1.40·ħ²/(m d²) = 10.67/d² eV·Å².',
    'A k=π/a: ω₋=√(2K/M_max), ω₊=√(2K/M_min). Con masse uguali il gap si chiude.': 'At k=π/a: ω₋=√(2K/M_max), ω₊=√(2K/M_min). With equal masses the gap closes.',
    'Con un solo atomo per cella esiste solo il ramo acustico: servono 2 atomi per cella per avere un ramo ottico.': 'With one atom per cell only the acoustic branch exists: 2 atoms per cell are needed to have an optical branch.'
  });
  I.rule(/^d primi vicini (.+)$/, m => `nearest-neighbour d ${m[1]}`);
  I.rule(/^gap ([\d.]+) THz$/, m => `gap ${m[1]} THz`);

  /* ---- pseudopotenziale ---- */
  I.add({
    'Ripristina potenziale vero': 'Restore true potential', 'V vero': 'true V', 'Potenziale vero · ψ con nodi': 'True potential · ψ with nodes',
    'nodi radiali (curva attuale)': 'radial nodes (current curve)', 'V(r_c) vero': 'true V(r_c)',
    'Fuori dal core le due funzioni quasi coincidono: è lì che avvengono legame e conduzione.': 'Outside the core the two functions almost coincide: that is where bonding and conduction take place.',
    'ψ funzione d\'onda': 'ψ wave function', 'funzione d\'onda': 'wave function', 'nucleo al centro': 'nucleus at the centre'
  });
  I.rule(/^r_c (\(.+\))$/, m => `r_c ${m[1].replace('≈ 0.4·r atomico', '≈ 0.4·atomic r').replace('Ashcroft, tabulato', 'Ashcroft, tabulated')}`);
  I.rule(/^Z_eff Slater core (.+)$/, m => `Z_eff Slater core ${m[1]}`);
  I.rule(/^Z_eff Slater valenza (.+)$/, m => `Z_eff Slater valence ${m[1]}`);
  I.rule(/^nodi attesi per lo stato (.+)$/, m => `expected nodes for the ${m[1]} state`);
  I.rule(/^⚠ <b>Curva qualitativa \(parametri approssimati\)<\/b>: per (.+) il raggio di empty core non è tabulato, si usa r<sub>c<\/sub> ≈ 0\.4·r<sub>atomico<\/sub>\.$/,
    m => `⚠ <b>Qualitative curve (approximate parameters)</b>: for ${nml(m[1])} the empty-core radius is not tabulated, r<sub>c</sub> ≈ 0.4·r<sub>atomic</sub> is used.`);

  /* ---- bande reali 3D ---- */
  I.add({
    'Calcolo in corso…': 'Computing…', "Diagonalizzazione dell'hamiltoniana per ogni punto k…": 'Diagonalising the Hamiltonian at each k point…',
    'bande': 'bands', 'bande di valenza': 'valence bands', 'bande di conduzione': 'conduction bands',
    'T: lacune': 'T: holes', 'L: elettroni': 'L: electrons', 'cono di Dirac (K)': 'Dirac cone (K)', 'E_F = E_Dirac': 'E_F = E_Dirac',
    'K (punto di Dirac)': 'K (Dirac point)', 'reticolo / percorso': 'lattice / path',
    'sovrapposizione T→L': 'T→L overlap', 'sperimentale': 'experimental', 'gap diretta in L': 'direct gap at L', 'gap diretta in T': 'direct gap at T',
    'massimo di valenza': 'valence-band maximum', 'minimo di conduzione': 'conduction-band minimum',
    'densità n = p (neutralità)': 'density n = p (neutrality)', 'distanze dei gusci': 'shell distances', 'tempo': 'time',
    'gap in K': 'gap at K', '0 eV (Dirac)': '0 eV (Dirac)', 't (primi vicini)': 't (nearest neighbours)', 't′ (secondi vicini)': 't′ (second neighbours)',
    'E(π*) in M': 'E(π*) at M', 'elettroni / atomo (Z_v)': 'electrons / atom (Z_v)', 'k_F (elettrone libero)': 'k_F (free electron)',
    'E_F sopra il fondo banda': 'E_F above the band bottom', 'onde piane / tempo': 'plane waves / time',
    'gap fondamentale (EPM)': 'fundamental gap (EPM)', 'gap sperimentale (300 K)': 'experimental gap (300 K)', 'tipo': 'type',
    'diretta': 'direct', 'indiretta': 'indirect', 'gap diretta minima': 'minimum direct gap', 'fattori V_S (Ry)': 'V_S factors (Ry)', 'fattori V_A (Ry)': 'V_A factors (Ry)',
    'Ingrandisci attorno a E<sub>F</sub>': 'Zoom around E<sub>F</sub>',
    'Tasca di lacune a T (1) ed elettroni a L (3): E<sub>F</sub> è fissato da n = p. Attiva «Ingrandisci attorno a E<sub>F</sub>» per vedere le bande incrociarsi.':
      'Hole pocket at T (1) and electron pockets at L (3): E<sub>F</sub> is fixed by n = p. Turn on “Zoom around E<sub>F</sub>” to see the bands cross.',
    "Dispersione lineare E = ±ħv<sub>F</sub>|q| attorno a K: fermioni di Dirac senza massa. L'asimmetria tra le due bande viene da t′.": 'Linear dispersion E = ±ħv<sub>F</sub>|q| around K: massless Dirac fermions. The asymmetry between the two bands comes from t′.',
    'Le bande sono quasi parabole libere ripiegate nella zona di Brillouin: il potenziale debole apre solo piccoli gap e alcune bande tagliano il livello di Fermi. Niente gap → metallo.':
      'The bands are almost free parabolas folded into the Brillouin zone: the weak potential opens only small gaps and some bands cross the Fermi level. No gap → metal.',
    "⚠ Modello <b>tight binding sp³ con spin-orbita</b> sul reticolo A7 vero, parametri nello stile di Liu &amp; Allen (PRB 52, 1566): riproduce l'ordine di grandezza di sovrapposizione e gap in L, non è un fit quantitativo.": '⚠ Model: <b>sp³ tight binding with spin-orbit</b> on the true A7 lattice, parameters in the style of Liu &amp; Allen (PRB 52, 1566): it reproduces the order of magnitude of the overlap and of the gap at L; it is not a quantitative fit.',
    '⚠ Solo le bande <b>π</b> (orbitali p<sub>z</sub>), tight binding con primi (t) e secondi (t′) vicini: le bande σ non sono mostrate.':
      '⚠ Only the <b>π</b> bands (p<sub>z</sub> orbitals), tight binding with first (t) and second (t′) neighbours: the σ bands are not shown.',
    'Modello semplificato: elettrone quasi libero sul reticolo vero, con pseudopotenziale empty core schermato (parametri approssimati).':
      'Simplified model: nearly free electron on the true lattice, with a screened empty-core pseudopotential (approximate parameters).',
    'Metallo semplice: pseudopotenziale locale a due coefficienti (Ashcroft), più semplice del modello usato per i semiconduttori.':
      'Simple metal: local pseudopotential with two coefficients (Ashcroft), simpler than the model used for the semiconductors.',
    '<b>Mancano le bande d</b>, essenziali in questo metallo: la figura mostra solo la banda s(p).': '<b>The d bands</b>, essential in this metal, are missing: the figure shows only the s(p) band.'
  });
  I.rule(/^(CFC|CCC|SC|esagonale compatta|romboedrica \(A7\)|nido d'ape 2D) · (.+)$/, m => ` · `);
  I.rule(/^Trasformazione ([\d.,]+ ?%)$/, m => `Transformation `);
  I.rule(/^Bande reali lungo (.+)$/, m => `Real bands along ${m[1]}`);
  I.rule(/^Banda (\d+) \((valenza|conduzione)\)$/, m => `Band ${m[1]} (${m[2] === 'valenza' ? 'valence' : 'conduction'})`);
  I.rule(/^Banda (\d+)$/, m => `Band ${m[1]}`);
  I.rule(/^([\d.]+) eV (diretta|indiretta)$/, m => `${m[1]} eV ${m[2] === 'diretta' ? 'direct' : 'indirect'}`);
  I.rule(/^(.+): gap nulla · cono di Dirac in K$/, m => `${nm(m[1])}: zero gap · Dirac cone at K`);
  I.rule(/^(.+): semimetallo · sovrapposizione ([\d.]+) meV$/, m => `${nm(m[1])}: semimetal · overlap ${m[2]} meV`);
  I.rule(/^(.+): metallo · (\d+) band[ae] attravers\w+ E_F$/, m => `${nm(m[1])}: metal · ${m[2]} band${m[2] === '1' ? '' : 's'} crossing E_F`);
  I.rule(/^(.+): gap (DIRETTA|INDIRETTA) · ([\d.]+) eV$/, m => `${nm(m[1])}: ${m[2] === 'DIRETTA' ? 'DIRECT' : 'INDIRECT'} gap · ${m[3]} eV`);
  I.rule(/^(.+): ([+\-−]?[\d.]+) meV$/, m => `${T(m[1])}: ${m[2]} meV`);
  I.rule(/^k: (.+)→(.+) (\d+)%$/, m => `k: ${m[1]}→${m[2]} ${m[3]}%`);
  I.rule(/^(\d+)% da (.+) a (.+)$/, m => `${m[1]}% from ${m[2]} to ${m[3]}`);
  I.rule(/^(.+) \((\d+)% da (.+) a (.+)\)$/, m => `${m[1]} (${m[2]}% from ${m[3]} to ${m[4]})`);
  I.rule(/^cella cubica convenzionale, a = ([\d.]+) Å$/, m => `conventional cubic cell, a = ${m[1]} Å`);
  I.rule(/^prisma esagonale, a = ([\d.]+) Å, c = ([\d.]+) Å \(c\/a = ([\d.]+)\)$/, m => `hexagonal prism, a = ${m[1]} Å, c = ${m[2]} Å (c/a = ${m[3]})`);
  I.rule(/^cella primitiva romboedrica \(A7\), 2 atomi; asse trigonale ∥ z \(atomi a ±u·c, u = ([\d.]+)\)$/, m => `primitive rhombohedral cell (A7), 2 atoms; trigonal axis ∥ z (atoms at ±u·c, u = ${m[1]})`);
  I.rule(/^piano di grafene, a = ([\d.]+) Å \(a_CC = ([\d.]+) Å\)$/, m => `graphene plane, a = ${m[1]} Å (a_CC = ${m[2]} Å)`);
  I.rule(/^· punti: (.+)$/, m => `· points: ${m[1]}`);
  I.rule(/^· (.+)$/, m => `· ${T(m[1])}`);
  I.rule(/^v_atomo\(q = (.+)\)$/, m => `v_atom(q = ${m[1]})`);

  /* ---- varie ---- */
  I.add({
    'Usa due dita per ruotare il modello': 'Use two fingers to rotate the model',
    'Teoria dello strumento': 'Tool theory'
  });
  I.rule(/^(.+) \(valore\)$/, m => `${T(m[1])} (value)`);
})();
