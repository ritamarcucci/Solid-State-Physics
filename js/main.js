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
 *  fisica, show la formatta nell'<output> accanto, onChange ricalcola.
 *  Accanto a ogni slider viene creato un campo numerico sincronizzato
 *  (vedi addNumberField). opts.display(raw) → { text, unit } permette di
 *  mostrare nel campo una grandezza diversa da show (usato per il raggio). */
function bindRange(id, map, show, onChange, opts = {}) {
  const el = $(id), out = $(id + '-out');
  const read = () => map(Number(el.value));
  const upd = () => { if (out) out.textContent = show(read()); onChange && onChange(); };
  el.addEventListener('input', upd);
  if (out) out.textContent = show(read());
  addNumberField(el, opts.display || (raw => parseDisplay(show(map(raw)))));
  return read;
}

/** Estrae numero e unità da una stringa come "1.234 Å", "+0.10 %", "300 K". */
function parseDisplay(str) {
  const m = /[-+−]?\d+(?:[.,]\d+)?/.exec(String(str));
  if (!m) return { text: '', unit: '' };
  return {
    text: m[0].replace(',', '.').replace('−', '-').replace(/^\+/, ''),
    unit: String(str).slice(m.index + m[0].length).trim()
  };
}

/* -----------------------------------------------------------------------------
 *  Campo numerico accanto allo slider
 *  - range e campo stanno sulla stessa riga (.range-row, flex);
 *  - il campo mostra la grandezza nelle stesse unità dell'etichetta;
 *  - digitando un valore (Invio o uscita dal campo) si sceglie la posizione
 *    dello slider il cui valore è più vicino (funziona anche per scale non
 *    lineari, come quella logaritmica della dimensione dei domini);
 *  - ogni modifica dello slider, anche fatta dal codice (animazioni, cambio
 *    di materiale), aggiorna il campo: per questo si intercetta il setter
 *    della proprietà value dell'elemento.
 * --------------------------------------------------------------------------- */
const VALUE_DESC = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
function addNumberField(range, display) {
  const row = document.createElement('div');
  row.className = 'range-row';
  range.parentNode.insertBefore(row, range);
  row.appendChild(range);

  const num = document.createElement('input');
  num.type = 'number';
  num.className = 'num-input';
  num.inputMode = 'decimal';
  num.step = 'any';
  num.id = range.id + '-num';
  const label = document.querySelector(`label[for="${range.id}"]`);
  num.setAttribute('aria-label', (label ? label.textContent.replace(/\s+/g, ' ').trim() : range.id) + ' (valore)');
  row.appendChild(num);
  const unit = document.createElement('span');
  unit.className = 'num-unit';
  row.appendChild(unit);
  if (label) label.classList.add('has-num');       // il valore ora sta nel campo: l'<output> si nasconde

  const raw = () => Number(VALUE_DESC.get.call(range));
  const sync = (force = false) => {
    if (!force && document.activeElement === num) return;   // non disturbare chi sta scrivendo
    const d = display(raw());
    num.value = d.text;
    unit.textContent = d.unit;
    // passo delle frecce del campo = una posizione dello slider
    const dec = (d.text.split('.')[1] || '').length;
    num.step = dec ? (10 ** -dec).toFixed(dec) : '1';
  };
  const commit = () => {
    let t = num.valueAsNumber;
    if (!Number.isFinite(t)) t = parseFloat(String(num.value).replace(',', '.'));
    if (!Number.isFinite(t)) { sync(true); return; }
    const lo = Number(range.min), hi = Number(range.max), cur = raw();
    let best = cur, bestErr = Infinity;
    for (let v = lo; v <= hi; v++) {
      const e = Math.abs(parseFloat(display(v).text) - t);
      if (e < bestErr) { bestErr = e; best = v; }
    }
    // se la scala è più grossa del valore digitato, almeno un passo nella direzione giusta
    const curVal = parseFloat(display(cur).text);
    if (best === cur && Math.abs(t - curVal) > 1e-12) best = Math.min(hi, Math.max(lo, cur + Math.sign(t - curVal)));
    range.value = best;
    range.dispatchEvent(new Event('input', { bubbles: true }));
    sync(true);
  };
  num.addEventListener('change', commit);
  num.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); num.blur(); } });
  range.addEventListener('input', () => sync());
  Object.defineProperty(range, 'value', {
    configurable: true,
    get() { return VALUE_DESC.get.call(this); },
    set(v) { VALUE_DESC.set.call(this, v); sync(); }
  });
  range._syncNum = sync;
  sync(true);
}

function fillSelect(sel, items) {
  sel.innerHTML = items.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
}
/** Render MathJax di un nodo (con attesa del caricamento della libreria). */
function typeset(el, tries = 0) {
  if (window.MathJax && MathJax.typesetPromise) { MathJax.typesetPromise([el]).catch(() => {}); return; }
  if (tries < 40) setTimeout(() => typeset(el, tries + 1), 250);
}
/** Avviso piccolo sotto il titolo di uno strumento (null per toglierlo):
 *  usato quando un materiale viene trattato con parametri approssimati. */
function setNotice(toolId, html) {
  const pane = document.querySelector(`#tool-${toolId} .viz-pane`);
  let el = pane.querySelector('.notice');
  if (!html) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.className = 'notice';
    el.setAttribute('role', 'note');
    el.style.cssText = 'flex:none;padding:7px 12px;border-radius:10px;font-size:13px;line-height:1.4;' +
      'background:rgba(255,181,71,.10);border:1px solid rgba(255,181,71,.45);color:#ffd08a';
    pane.querySelector('.viz-head').after(el);
  }
  el.innerHTML = html;
}

/** Ricalcolo al massimo una volta per frame (slider molto rapidi). */
function rafThrottle(fn) {
  let pending = false;
  return () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; fn(); }); };
}
const M = () => Physics.MATERIALS;

/** Riempie un menu con l'elenco UNICO dei materiali, raggruppato per categoria.
 *  Ogni strumento mostra le stesse voci; quelle che lo strumento non sa trattare
 *  restano visibili ma disabilitate, con il motivo tra parentesi. */
function materialSelect(sel, tool, preferred) {
  const groups = Physics.MATERIAL_GROUPS.map(g => {
    const opts = Object.entries(M()).filter(([, m]) => m.group === g.id).map(([k, m]) => {
      const ok = Physics.supports(tool, k);
      const struct = Physics.STRUCTURES[m.structure] ? m.structure.toUpperCase() : m.structure.toUpperCase();
      return `<option value="${k}"${ok === true ? '' : ' disabled'}>${m.name} (${m.formula}) — ${struct}${ok === true ? '' : ` · non disponibile: ${ok}`}</option>`;
    }).join('');
    return `<optgroup label="${g.label}">${opts}</optgroup>`;
  });
  sel.innerHTML = groups.join('');
  const first = [...sel.options].find(o => !o.disabled);
  sel.value = (preferred && Physics.supports(tool, preferred) === true) ? preferred : first.value;
  // difesa: se una voce disabilitata viene selezionata (es. via script), si torna all'ultima valida.
  // Questo listener è registrato prima di quelli dello strumento, quindi agisce per primo.
  let last = sel.value;
  sel.addEventListener('change', () => {
    if (Physics.supports(tool, sel.value) !== true) sel.value = last; else last = sel.value;
  });
}


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
      { id: 'tb', label: 'Bottom-up', desc: 'Tight binding 1D e 3D' },
      { id: 'pseudo', label: 'Il trucco del nucleo', desc: 'Pseudopotenziale' },
      { id: 'bands3d', label: 'Bande reali 3D', desc: 'Si, Ge, GaAs, Al, Be, Bi, grafene: L, Γ, X, W, K' }
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
  Theory.onRoute(name);
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
  Theory.onRoute('work');                       // se la teoria è aperta, mostra quella del nuovo strumento
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
 *  TEORIA: pulsante fluttuante + finestra
 *  Desktop: widget non modale grande, in basso a destra sopra il pulsante,
 *  trascinabile dalla testata (i grafici restano visibili e si possono usare
 *  i controlli). Mobile (≤ 768 px): bottom sheet
 *  modale con sfondo scurito. Si chiude con ×, Esc o (su mobile) toccando
 *  lo sfondo. Se si cambia strumento con la finestra aperta, il testo segue.
 * ============================================================================= */
const Theory = {
  open: false,
  srcs: new Map(),
  typeset: new Set(),
  init() {
    document.querySelectorAll('#theory-store .theory-src').forEach(el => this.srcs.set(el.dataset.tool, el));
    $('theory-fab').addEventListener('click', () => (this.open ? this.close() : this.show()));
    $('theory-close').addEventListener('click', () => this.close());
    $('theory-backdrop').addEventListener('click', () => this.close());
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.open) this.close(); });
    window.matchMedia('(max-width: 768px)').addEventListener('change', () => this.applyMode());
    window.addEventListener('resize', () => this.clamp());
    this.initDrag();
    this.initResize();
  },
  /** Desktop: la finestra si trascina dalla testata e resta dentro lo schermo. */
  initDrag() {
    const panel = $('theory-panel'), head = panel.querySelector('.theory-head');
    let dx = 0, dy = 0;
    head.addEventListener('pointerdown', e => {
      if (this.isSheet() || e.button !== 0 || e.target.closest('.theory-close')) return;
      const r = panel.getBoundingClientRect();
      dx = e.clientX - r.left; dy = e.clientY - r.top;
      // passa da right/bottom a left/top mantenendo la posizione attuale
      panel.style.left = r.left + 'px'; panel.style.top = r.top + 'px';
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.classList.add('dragging');
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', e => {
      if (!panel.classList.contains('dragging')) return;
      this.place(e.clientX - dx, e.clientY - dy);
    });
    const end = e => {
      if (!panel.classList.contains('dragging')) return;
      panel.classList.remove('dragging');
      if (head.hasPointerCapture(e.pointerId)) head.releasePointerCapture(e.pointerId);
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  },
  /** Desktop: la finestra si ridimensiona da bordi e angoli (8 maniglie). */
  initResize() {
    const panel = $('theory-panel'), MINW = 320, MINH = 220;
    for (const d of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      const grip = document.createElement('div');
      grip.className = 'theory-resize tr-' + d;
      grip.setAttribute('aria-hidden', 'true');
      panel.appendChild(grip);
      grip.addEventListener('pointerdown', e => {
        if (this.isSheet() || e.button !== 0) return;
        e.preventDefault();
        const r = panel.getBoundingClientRect(), s = { x: e.clientX, y: e.clientY, l: r.left, t: r.top, w: r.width, h: r.height };
        // da right/bottom/max-height a left/top/width/height espliciti
        Object.assign(panel.style, { left: s.l + 'px', top: s.t + 'px', right: 'auto', bottom: 'auto',
          width: s.w + 'px', height: s.h + 'px', maxHeight: 'none' });
        panel.classList.add('dragging');
        grip.setPointerCapture(e.pointerId);
        const move = ev => {
          const dx = ev.clientX - s.x, dy = ev.clientY - s.y;
          let l = s.l, t = s.t, w = s.w, h = s.h;
          if (d.includes('e')) w = Math.min(Math.max(MINW, s.w + dx), innerWidth - s.l);
          if (d.includes('s')) h = Math.min(Math.max(MINH, s.h + dy), innerHeight - s.t);
          if (d.includes('w')) { l = Math.min(Math.max(0, s.l + dx), s.l + s.w - MINW); w = s.w + (s.l - l); }
          if (d.includes('n')) { t = Math.min(Math.max(0, s.t + dy), s.t + s.h - MINH); h = s.h + (s.t - t); }
          Object.assign(panel.style, { left: l + 'px', top: t + 'px', width: w + 'px', height: h + 'px' });
        };
        const end = ev => {
          panel.classList.remove('dragging');
          grip.removeEventListener('pointermove', move);
          grip.removeEventListener('pointerup', end);
          grip.removeEventListener('pointercancel', end);
          if (grip.hasPointerCapture(ev.pointerId)) grip.releasePointerCapture(ev.pointerId);
        };
        grip.addEventListener('pointermove', move);
        grip.addEventListener('pointerup', end);
        grip.addEventListener('pointercancel', end);
      });
    }
  },
  /** Posiziona la finestra con l'angolo in alto a sinistra in (x, y), dentro lo schermo. */
  place(x, y) {
    const p = $('theory-panel'), w = p.offsetWidth, h = p.offsetHeight;
    p.style.left = Math.min(Math.max(0, x), Math.max(0, innerWidth - w)) + 'px';
    p.style.top = Math.min(Math.max(0, y), Math.max(0, innerHeight - h)) + 'px';
  },
  /** Cambio lingua: si ripristinano i testi italiani originali (prima di MathJax) e, in inglese, si traducono. */
  rebuild() {
    const th = $('theory-store'), nt = $('b3-note-store');
    th.innerHTML = this.pristine.theory; nt.innerHTML = this.pristine.notes;
    I18N.apply(th); I18N.apply(nt);                       // no-op in italiano
    this.srcs.clear(); this.typeset.clear();
    th.querySelectorAll('.theory-src').forEach(el => this.srcs.set(el.dataset.tool, el));
    if (this.open) this.fill();
  },
  resetInline() { const p = $('theory-panel'); for (const k of ['left', 'top', 'right', 'bottom', 'width', 'height', 'maxHeight']) p.style[k] = ''; },
  /** Dopo un ridimensionamento della finestra del browser, riporta il pannello dentro lo schermo. */
  clamp() {
    const p = $('theory-panel');
    if (this.isSheet()) { this.resetInline(); return; }
    if (p.style.width) p.style.width = Math.min(p.offsetWidth, innerWidth) + 'px';
    if (p.style.height) p.style.height = Math.min(p.offsetHeight, innerHeight) + 'px';
    if (p.style.left && p.style.left !== 'auto') this.place(parseFloat(p.style.left), parseFloat(p.style.top));
  },
  isSheet() { return window.matchMedia('(max-width: 768px)').matches; },
  applyMode() {
    const sheet = this.isSheet();
    $('theory-panel').setAttribute('aria-modal', sheet ? 'true' : 'false');
    if (sheet) this.resetInline();
    $('theory-backdrop').classList.toggle('hidden', !(this.open && sheet));
    document.body.classList.toggle('sheet-open', this.open && sheet);
  },
  /** Mette nella finestra il testo dello strumento attivo. */
  fill() {
    const id = state.tool, src = this.srcs.get(id);
    const meta = Object.values(MODULES).flatMap(m => m.tools).find(t => t.id === id);
    $('theory-title').textContent = meta ? meta.label : 'Teoria';
    const body = $('theory-body');
    body.replaceChildren(src || document.createTextNode('Nessun testo per questo strumento.'));
    body.scrollTop = 0;
    if (src && !this.typeset.has(id)) { this.typeset.add(id); typeset(body); }
  },
  show() {
    if (!state.tool) return;
    this.open = true;
    this.fill();
    $('theory-panel').classList.remove('hidden');
    $('theory-fab').setAttribute('aria-expanded', 'true');
    $('theory-fab').classList.add('active');
    this.applyMode();
    this.clamp();
    $('theory-close').focus({ preventScroll: true });
  },
  close() {
    this.open = false;
    $('theory-panel').classList.add('hidden');
    $('theory-fab').setAttribute('aria-expanded', 'false');
    $('theory-fab').classList.remove('active');
    this.applyMode();
  },
  /** Chiamata a ogni cambio di vista o di strumento. */
  onRoute(view) {
    $('theory-fab').classList.toggle('hidden', view !== 'work');
    if (view !== 'work') this.close();
    else if (this.open) this.fill();
  }
};

/** Evita a capo "strani" nei pannelli dei dati: numero e unità restano uniti (spazio non separabile)
 *  e i percorsi tipo T–Γ–L–X non si spezzano sui trattini. Agisce sui nodi di testo, quindi
 *  non altera l'HTML né le formule. Ogni volta che un pannello viene riscritto si ripete. */
function glueText(root) {
  const unit = /([\d⁰¹²³⁴⁵⁶⁷⁸⁹]) (?=(?:eV|meV|Å|K\b|Ry|cm|m\/s|%|ms|nm|e⁻|u\b|THz|GPa|°|π\/a))/g;
  const dash = /([^\s⁠])–(?=[^\s⁠])/g;
  const colon = /(:) (?=[+\-−]?\d)/g;          // "L: −23.7 meV" non si spezza dopo i due punti
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const v = n.nodeValue, r = v.replace(unit, '$1 ').replace(colon, '$1 ').replace(dash, '$1–⁠').replace(/⁠+/g, '⁠');
    if (r !== v) n.nodeValue = r;
  }
}
function initTextGlue() {
  const mo = new MutationObserver(list => {
    for (const m of list) m.addedNodes.forEach(nd => { if (nd.nodeType === 1) glueText(nd); else if (nd.nodeType === 3 && nd.parentElement) glueText(nd.parentElement); });
  });
  document.querySelectorAll('.readout, .b3-notes, .ctrl-pane .hint').forEach(el => {
    glueText(el);
    mo.observe(el, { childList: true, subtree: true });
  });
}

/** Il testo intero dei badge è sempre leggibile passando il mouse (title),
 *  anche quando sul desktop viene accorciato con i puntini di sospensione. */
function initBadges() {
  const mo = new MutationObserver(list => {
    for (const r of list) {
      const b = r.target.nodeType === 1 ? r.target.closest('.badge') : r.target.parentElement?.closest('.badge');
      if (b) b.title = b.textContent;
    }
  });
  document.querySelectorAll('.viz-head .badge').forEach(b => {
    b.title = b.textContent;
    mo.observe(b, { childList: true, characterData: true, subtree: true });
  });
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
    materialSelect($('lat-mat'), 'lattice', 'Cu');
    this.view = new Visuals.LatticeView($('lat-3d'));
    this.structure = null;

    const update = rafThrottle(() => this.update());
    // campo numerico del raggio in Å (lo slider va da 0 al raggio di contatto)
    const rTouch = () => Physics.STRUCTURES[$('lat-struct').value].touch * M()[$('lat-mat').value].a;
    this.readR = bindRange('lat-r', v => v / 1000, () => '', update,
      { display: raw => ({ text: (raw / 1000 * rTouch()).toFixed(3), unit: 'Å' }) });
    $('lat-mat').addEventListener('change', () => { $('lat-struct').value = M()[$('lat-mat').value].structure; this.rebuild(); });
    $('lat-struct').addEventListener('change', () => this.rebuild());
    $('lat-clip').addEventListener('change', update);
    $('lat-btn-touch').addEventListener('click', () => this.animateTo(1));
    $('lat-struct').value = M()[$('lat-mat').value].structure;
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
    $('lat-r')._syncNum();          // il raggio in Å dipende anche da materiale e reticolo

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
      <div class="row"><span>r tabulato (${mat.group === 'semi' ? 'covalente' : 'CN 12'})</span><b>${fmt(mat.rMetal, 3)} Å</b></div>
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
    materialSelect($('ew-mat'), 'ewald', 'Cu');
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
    $('ew-block').addEventListener('change', () => this.setMaterial());
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
    this.v.setCrystal(mat, { block: $('ew-block').checked });
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
        top.map(n => `<div class="row"><b>(${[n.h, n.k, n.l].map(v => Math.round(v).toFixed(0)).join(' ')})</b><span>${fmt(n.lambda, 3)}</span><span>${fmt(n.twoTheta, 1)}°</span></div>`).join('')
        : '<span>Nessun nodo tra le due sfere: ruota il cristallo o allarga lo spettro.</span>'}`;
  }
};

/* -----------------------------------------------------------------------------
 *  1.3 Stanza dei raggi X (polveri)
 * --------------------------------------------------------------------------- */
Tools.powder = {
  init() {
    materialSelect($('pw-mat'), 'powder', 'Cu');
    fillSelect($('pw-lambda'), Physics.WAVELENGTHS.map(w => [w.value, w.label]));
    const update = rafThrottle(() => this.update());
    this.size = bindRange('pw-size', v => 2 * Math.pow(500, v / 1000), v => `${v < 100 ? fmt(v, 1) : fmt(v, 0)} nm`, update);
    this.T = bindRange('pw-T', v => v, v => `${v} K`, update);
    this.strain = bindRange('pw-strain', v => v / 10000, v => `${v >= 0 ? '+' : ''}${fmt(100 * v, 2)} %`, update);
    this.micro = bindRange('pw-micro', v => v / 20000, v => `${fmt(100 * v, 3)} %`, update);
    this.grad = bindRange('pw-grad', v => v / 10000, v => `${fmt(100 * v, 2)} %`, update);
    ['pw-mat', 'pw-struct', 'pw-lambda', 'pw-log'].forEach(id => $(id).addEventListener('change', update));
    this.chart = Visuals.makeChart($('pw-chart'), {
      xTitle: I18N.t('2θ (gradi)'), yTitle: I18N.t('Intensità (u.a.)'), legend: false,
      x: { min: 15, max: 150 }, y: { min: 0, max: 110 }
    });
    new ResizeObserver(() => this.drawRings()).observe($('pw-rings').parentElement);
    this.update();
  },
  /** Figura di diffrazione 2D di una polvere: un anello per ogni riflessione (hkl). Il raggio è
   *  proporzionale a 2θ (pellicola di Debye-Scherrer), la luminosità a I_hkl, lo spessore alla FWHM del picco. */
  drawRings() {
    const res = this.lastRes, cv = $('pw-rings');
    if (!res || !cv) return;
    const host = cv.parentElement, w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 8, TT = 150;
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) / 2);
    bg.addColorStop(0, '#0d1428'); bg.addColorStop(1, '#04060d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    // scala angolare: cerchi tratteggiati a 30°, 60°, ... 150°
    ctx.font = '10px JetBrains Mono, monospace'; ctx.textAlign = 'left';
    for (let a = 30; a <= TT; a += 30) {
      ctx.strokeStyle = 'rgba(148,160,187,.16)'; ctx.setLineDash([2, 5]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R * a / TT, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(148,160,187,.45)'; ctx.fillText(`${a}°`, cx + R * a / TT * 0.707 + 3, cy + R * a / TT * 0.707 + 11);
    }
    const log = $('pw-log').checked, C = Visuals.COLORS;
    const peaks = res.peaks.filter(p => p.Irel > 0.05 && p.tt <= TT).sort((p, q) => p.Irel - q.Irel);
    for (const p of peaks) {
      const r = R * p.tt / TT;
      const a = Math.min(1, Math.max(0.07, log ? (Math.log10(Math.max(p.Irel, 0.01)) + 2) / 4 : Math.pow(p.Irel / 100, 0.55)));
      const lw = Math.max(1.3, R * (p.H / TT) * 2.4);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.strokeStyle = `rgba(255,170,60,${0.22 * a})`; ctx.lineWidth = lw * 4.5; ctx.stroke();      // alone
      ctx.strokeStyle = `rgba(255,205,110,${0.85 * a})`; ctx.lineWidth = lw; ctx.stroke();           // anello
      ctx.strokeStyle = `rgba(255,250,225,${a})`; ctx.lineWidth = Math.max(1, lw * 0.3); ctx.stroke(); // nucleo luminoso
    }
    // etichette (hkl) degli anelli più intensi, alternate su due angoli per non sovrapporsi
    ctx.textAlign = 'center'; ctx.font = '600 10.5px JetBrains Mono, monospace';
    const lab = res.peaks.filter(p => p.Irel > 6 && p.tt <= TT);
    lab.forEach((p, i) => {
      const ang = (i % 2 ? -0.35 : -0.95), r = R * p.tt / TT;
      ctx.fillStyle = 'rgba(5,7,15,.75)';
      const txt = `${p.h}${p.k}${p.l}`, tw = ctx.measureText(txt).width;
      ctx.fillRect(cx + r * Math.cos(ang) - tw / 2 - 2, cy + r * Math.sin(ang) - 17, tw + 4, 13);
      ctx.fillStyle = C.text; ctx.fillText(txt, cx + r * Math.cos(ang), cy + r * Math.sin(ang) - 7);
    });
    // fascio diretto bloccato (beam stop)
    ctx.fillStyle = '#02030a'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = 'rgba(255,181,71,.7)'; ctx.lineWidth = 1.2; ctx.stroke();
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
      ? { type: 'logarithmic', min: 0.3, max: 200, title: { display: true, text: I18N.t('Intensità (u.a., log)') } }
      : { type: 'linear', min: 0, max: 110, title: { display: true, text: I18N.t('Intensità (u.a.)') } };
    this.chart.data.datasets = [Visuals.line(data, Visuals.COLORS.accent, { width: 1.6, fill: 'origin', fillColor: 'rgba(255,181,71,.10)', label: 'I(2θ)' })];
    // etichette (hkl) sui picchi più alti
    const bgAt = tt => res.y[Math.round((tt - 15) / 135 * (res.y.length - 1))];
    this.chart.options.plugins.overlays = {
      labels: res.peaks.filter(p => p.relHeight > (log ? 0.2 : 3)).map(p => ({
        x: p.tt, y: Math.max(bgAt(p.tt), log ? 0.4 : 0), text: `${p.h}${p.k}${p.l}`, color: Visuals.COLORS.text
      }))
    };
    this.chart.update('none');
    this.lastRes = res;
    this.drawRings();

    // tabella riflessioni: indici con spazio se ≥ 10 o negativi, barra dell'intensità, riga più intensa in evidenza
    const hkl = p => [p.h, p.k, p.l].some(v => v < 0 || v > 9) ? `(${p.h} ${p.k} ${p.l})` : `(${p.h}${p.k}${p.l})`;
    const Imax = Math.max(...res.peaks.map(p => p.Irel), 0);
    $('pw-table').innerHTML = '<thead><tr><th title="indici di Miller">hkl</th><th title="angolo di diffrazione 2θ, in gradi">Angolo 2θ <small>(°)</small></th><th title="distanza tra i piani reticolari">d <small>(Å)</small></th><th title="molteplicità: quanti piani equivalenti">m</th><th title="fattore di struttura al quadrato">|F|²</th><th title="fattore di Debye-Waller e^(−2Bs²)">DW</th><th title="intensità relativa al picco più forte">I %</th></tr></thead><tbody>' +
      res.peaks.map(p => {
        const w = Math.max(0, Math.min(100, p.Irel));
        const cls = p.Irel >= Imax - 1e-9 && Imax > 0 ? 'top' : (p.Irel < 0.05 ? 'zero' : '');
        return `<tr class="${cls}"><td>${hkl(p)}</td><td>${fmt(p.tt, 2)}</td><td>${fmt(p.d, 4)}</td><td>${p.m}</td><td>${fmt(p.F2, 0)}</td><td>${fmt(p.DW, 3)}</td>` +
          `<td class="ibar" style="background:linear-gradient(90deg,rgba(255,181,71,.30) ${w}%,transparent ${w}%)">${fmt(p.Irel, 1)}</td></tr>`;
      }).join('') + '</tbody>';

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
    materialSelect($('kp-mat'), 'kp', 'Na');
    const update = rafThrottle(() => this.update());
    this.V0 = bindRange('kp-V0', v => v / 20, v => `${fmt(v, 2)} eV`, update);
    this.a = bindRange('kp-a', v => v / 100, v => `${fmt(v, 2)} Å`, update);
    this.b = bindRange('kp-b', v => v / 100, v => fmt(v, 2), update);
    ['kp-mat', 'kp-free', 'kp-ext'].forEach(id => $(id).addEventListener('change', update));
    this.chart = Visuals.makeChart($('kp-chart'), { xTitle: 'k (π/a)', yTitle: 'E (eV)', x: { min: -1, max: 1, ticks: { stepSize: 0.5 } } });
    this.pot = Visuals.makeChart($('kp-pot'), { xTitle: 'x (Å)', yTitle: 'V (eV)', legend: false });
    this.chart.$fmtX = x => `k = ${x.toFixed(3)} π/a`;
    this.chart.$fmtY = y => `E = ${y.toFixed(3)} eV`;
    this.pot.$fmtX = x => `x = ${x.toFixed(2)} Å`;
    this.pot.$fmtY = y => `V = ${y.toFixed(2)} eV`;
    this.update();
  },
  update() {
    const V0 = this.V0(), a = this.a(), bf = this.b(), mat = M()[$('kp-mat').value];
    const kp = Physics.kpBands({ V0, a, bFrac: bf, nBands: 4 });
    const C = Visuals.COLORS;
    const Etop = kp.bands.length ? kp.bands[kp.bands.length - 1].Emax : kp.Emax;
    const ds = [];
    const ext = $('kp-ext').checked;           // schema a zona estesa?
    const nB = kp.bands.length;
    if ($('kp-free').checked) {
      if (ext) {
        // zona estesa: la parabola libera non va ripiegata
        const pts = [];
        for (let i = 0; i <= 400; i++) {
          const kr = -nB + 2 * nB * i / 400;
          pts.push({ x: kr, y: Physics.CONST.HBAR2_2M * (kr * Math.PI / a) ** 2 + kp.Vavg });
        }
        ds.push(Visuals.line(pts, 'rgba(148,160,187,.45)', { width: 1, dash: [5, 4], label: 'elettrone libero + V̄', order: 2 }));
      } else {
        Physics.freeElectronFolded(a, kp.Vavg, Etop * 1.02).forEach((c, i) =>
          ds.push(Visuals.line(c.map(p => ({ x: p.k, y: p.E })), 'rgba(148,160,187,.45)',
            { width: 1, dash: [5, 4], label: i === 0 ? 'elettrone libero + V̄ (ripiegato)' : '_', order: 2 })));
      }
    }
    kp.bands.forEach((b, i) => {
      const pos = b.pts.slice().sort((p, q) => p.k - q.k);
      const col = C.series[i % C.series.length];
      if (ext) {
        // banda n nella n-esima zona: due rami simmetrici (k > 0 e k < 0)
        const right = pos.map(p => ({ x: Physics.extendedK(p.k, i + 1), y: p.E })).sort((p, q) => p.x - q.x);
        const left = right.map(p => ({ x: -p.x, y: p.y })).reverse();
        ds.push(Visuals.line(right, col, { width: 2.4, label: `banda ${i + 1}` }));
        ds.push(Visuals.line(left, col, { width: 2.4, tip: `banda ${i + 1}` }));
      } else {
        const pts = pos.map(p => ({ x: -p.k, y: p.E })).reverse().concat(pos.map(p => ({ x: p.k, y: p.E })));
        ds.push(Visuals.line(pts, col, { width: 2.4, label: `banda ${i + 1}` }));
      }
    });
    const F = Physics.kpFermi(kp, mat.valence);
    this.chart.data.datasets = ds;
    this.chart.options.scales.x.min = ext ? -nB : -1;
    this.chart.options.scales.x.max = ext ? nB : 1;
    this.chart.options.scales.x.ticks = { stepSize: ext ? 1 : 0.5 };
    this.chart.options.scales.x.title.text = I18N.t(ext ? 'k (π/a) — schema a zona estesa' : 'k (π/a) — 1ª zona di Brillouin');
    this.chart.options.scales.y.min = 0;
    this.chart.options.scales.y.max = Math.ceil(Etop * 1.05);
    // bordi delle zone di Brillouin e vettore di Fermi (k_F = Z/2 in unità di π/a)
    const kF = mat.valence / 2;
    const zoneLines = [];
    if (ext) for (let z = 1; z < nB; z++) zoneLines.push({ x: z, color: 'rgba(148,160,187,.3)', dash: [2, 4], label: z === 1 ? 'π/a' : `${z}π/a` }, { x: -z, color: 'rgba(148,160,187,.3)', dash: [2, 4] });
    const kFLines = ext
      ? [{ x: kF, color: 'rgba(255,181,71,.45)', dash: [2, 4], label: 'k_F' }, { x: -kF, color: 'rgba(255,181,71,.45)', dash: [2, 4] }]
      : [{ x: -0.5, color: 'rgba(255,181,71,.25)', dash: [2, 4] }, { x: 0.5, color: 'rgba(255,181,71,.25)', dash: [2, 4], label: mat.valence % 2 ? 'k_F' : '' }];
    this.chart.options.plugins.overlays = {
      yRanges: kp.gaps.filter(g => g.width > 0.02).map((g, i) => ({
        from: g.Elo, to: g.Ehi, color: 'rgba(255,107,129,.10)', label: `gap ${i + 1}: ${fmt(g.width, 2)} eV`, labelColor: C.danger
      })),
      hLines: F ? [{ y: F.EF, color: C.accent, dash: [6, 4], label: `E_F = ${fmt(F.EF, 2)} eV` }] : [],
      vLines: [{ x: 0, color: 'rgba(148,160,187,.25)', dash: [2, 4] }].concat(zoneLines, kFLines)
    };
    this.chart.update('none');

    // potenziale V(x) su tre celle
    // 4 celle (da −a a 3a): buche a V = 0 (ambra tenue) e barriere di altezza V₀ e larghezza b·a (viola pieno)
    const vp = [], wells = [];
    for (let c = -1; c <= 2; c++) {
      const x0 = c * a, xb = x0 + a - bf * a;
      vp.push({ x: x0, y: 0 }, { x: xb, y: 0 }, { x: xb, y: V0 }, { x: x0 + a, y: V0 }, { x: x0 + a, y: 0 });
    }
    const top = Math.max(V0, 0.5);
    this.pot.data.datasets = [Visuals.line(vp, C['accent-3'], { width: 2.4, fill: 'origin', fillColor: 'rgba(157,140,255,.38)' })];
    const sx = this.pot.options.scales.x, sy = this.pot.options.scales.y;
    sy.min = -top * 0.08; sy.max = top * 1.55;
    sx.min = -a; sx.max = 3 * a;
    // ascisse in multipli del passo (−a, 0, a, 2a, 3a) e ordinate solo 0 e V₀: meno rumore, più lettura
    sx.afterBuildTicks = ax => { ax.ticks = [-1, 0, 1, 2, 3].map(n => ({ value: n * a })); };
    sx.ticks = Object.assign(sx.ticks || {}, { callback: v => { const n = Math.round(v / a); return n === 0 ? '0' : Math.abs(n) === 1 ? (n < 0 ? '−a' : 'a') : `${n}a`; } });
    sy.afterBuildTicks = ay => { ay.ticks = V0 > 0 ? [{ value: 0 }, { value: V0 }] : [{ value: 0 }]; };
    sy.ticks = Object.assign(sy.ticks || {}, { callback: v => (v === 0 ? '0' : `V₀=${fmt(v, 2)}`) });
    this.pot.options.plugins.overlays = {
      hLines: V0 > 0 ? [{ y: V0, color: 'rgba(157,140,255,.45)', dash: [3, 4], width: 1 }] : [],
      vLines: [-1, 0, 1, 2, 3].map(n => ({ x: n * a, color: 'rgba(148,160,187,.22)', dash: [2, 4] })),
      dims: [
        { x1: 0, x2: a, y: top * 1.32, label: `a = ${fmt(a, 2)} Å`, color: C.accent },
        ...(bf > 0.02 && V0 > 0 ? [{ x1: a - bf * a, x2: a, y: top * 1.1, label: bf >= 0.12 ? `b·a` : '', color: C['accent-3'] }] : [])
      ]
    };
    this.pot.update('none');

    // confronto con la teoria perturbativa (elettrone quasi libero):
    // gap n-esimo ≈ 2|V_G|, con V_G = V0·sin(nπb/a)/(nπ) (coeff. di Fourier della barriera)
    const nfe = n => 2 * V0 * Math.abs(Math.sin(n * Math.PI * bf)) / (n * Math.PI);
    // Modello 1D: Z dispari → banda a metà (metallo); Z pari → bande piene (con gap) o bande che si toccano.
    // NON è il carattere del materiale reale: in 3D le bande possono sovrapporsi (Mg, Be, Fe…) oppure
    // il gap è piccolo (Si, Ge, GaAs: semiconduttori, non isolanti).
    const kind = !F ? '—' : mat.valence % 2 === 1 ? '<span class="ok">banda a metà → metallo</span>'
      : F.metal ? '<span class="ok">bande che si toccano → metallo</span>'
      : `<span class="hl">bande piene, gap ${fmt(F.gap, 2)} eV</span>`;
    const real = mat.character === 'semiconduttore' ? `<span class="hl">semiconduttore</span> (gap ${fmt(mat.expGap, 2)} eV)`
      : mat.character === 'semimetallo' ? '<span class="ok">semimetallo</span>' : '<span class="ok">metallo</span>';
    // spiegazione quando il modello 1D e la realtà non coincidono
    const oneDmetal = !F || mat.valence % 2 === 1 || F.metal;
    const mismatch = mat.character === 'semiconduttore'
      ? (oneDmetal ? 'Con V₀ ≈ 0 il modello non ha gap: aumenta V₀ per aprirlo. Il materiale reale ha il gap sperimentale indicato (è un semiconduttore, non un isolante).'
        : 'Il gap del modello dipende da V₀ e a (sliders), non è quello del materiale: il valore reale è quello sperimentale.')
      : (!oneDmetal && mat.valence % 2 === 0
        ? 'In 1D un numero pari di elettroni riempie bande intere; nel cristallo 3D le bande si sovrappongono in energia e il materiale resta un metallo.' : '');
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
      <div class="row"><span>modello 1D</span><span>${kind}</span></div>
      <div class="row"><span>${mat.name} reale (3D)</span><b>${real}</b></div>
      ${mismatch ? `<span class="hint">${mismatch}</span>` : ''}`;
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
    ['tb-o1', 'tb-o2', 'tb-o3', 'tb-pair', 'tb-ext'].forEach(id => $(id).addEventListener('change', update));
    materialSelect($('tb-mat'), 'tb', 'Cu');
    $('tb-mat').addEventListener('change', () => { this.applyMaterial(); this.update(); });
    $('tb-chain').addEventListener('change', () => this.setChain());
    $('tb-kind').addEventListener('change', () => this.setChain());
    this.ek = Visuals.makeChart($('tb-ek'), { xTitle: 'k (π/a)', yTitle: 'E (eV)', x: { min: -1, max: 1, ticks: { stepSize: 0.5 } } });
    this.va = Visuals.makeChart($('tb-va'), { xTitle: I18N.t('passo a (Å)'), yTitle: 'E (eV)' });
    this.setChain();
  },
  /** Cambia il range dello slider del passo: nella catena biatomica la cella
   *  contiene due atomi, quindi i primi vicini stanno a a/2. */
  setChain() {
    const chain = $('tb-chain').value, d3 = !!Physics.TB3[chain];
    if (d3) $('tb-kind').value = 'el';                        // fononi solo in 1D
    $('tb-kind').querySelector('option[value="ph"]').disabled = d3;
    const di = chain === 'di', ph = $('tb-kind').value === 'ph';
    const s = $('tb-a');
    s.min = d3 ? 200 : di ? 300 : 150; s.max = d3 ? 700 : di ? 1000 : 600;
    this.applyMaterial();
    // in 3D: solo primi vicini, niente zona estesa
    ['tb-o1', 'tb-o2', 'tb-o3', 'tb-ext'].forEach(id => $(id).closest('label').classList.toggle('hidden', d3));
    $('tb-o1').closest('.ctrl-group').querySelector('.lbl').classList.toggle('hidden', d3);
    $('tb-title').textContent = d3 ? 'Bottom-up: tight binding 3D' : 'Bottom-up: tight binding 1D';
    document.querySelector('#tb-a-label').firstChild.nodeValue = d3 ? 'Costante reticolare ' : 'Passo ';
    $('tb-eB-wrap').classList.toggle('hidden', !di);
    $('tb-el-ctrls').classList.toggle('hidden', ph);
    $('tb-ph-ctrls').classList.toggle('hidden', !ph);
    $('tb-va-host').classList.toggle('hidden', ph);
    document.querySelector('#tool-tb .chart-row').classList.toggle('single', ph);
    this.update();
  },
  /** Il passo della catena è la distanza tra primi vicini del materiale scelto
   *  (catena monoatomica) o il doppio (catena biatomica, due atomi per cella). */
  applyMaterial() {
    const chain = $('tb-chain').value, di = chain === 'di', s = $('tb-a');
    const d = Physics.nearestNeighbor(M()[$('tb-mat').value]);
    // 3D: a è la costante della cella cubica, con d = a·(1, √3/2, 1/√2) per SC, BCC, FCC
    const f = Physics.TB3[chain] ? 1 / Physics.TB3[chain].dOverA : (di ? 2 : 1);
    s.value = clamp(Math.round(f * d * 100), Number(s.min), Number(s.max));
    $('tb-a-out').textContent = `${fmt(this.a(), 2)} Å`;
  },

  /** Tight binding 3D (SC, BCC, FCC): un orbitale s per sito, solo primi vicini, hopping di Harrison. */
  update3D() {
    const lat = $('tb-chain').value, L = Physics.TB3[lat], C = Visuals.COLORS;
    const a = this.a(), eA = this.eA(), d = a * L.dOverA, t = Physics.harrisonT(d);
    const R = Physics.tbCubicBands(lat, eA, t);
    const sx = this.ek.options.scales.x, sy = this.ek.options.scales.y;
    sx.min = 0; sx.max = R.x[R.x.length - 1]; sx.ticks.display = false; sx.grid = { ...(sx.grid || {}), display: false };
    sx.title.text = I18N.t('percorso nella zona di Brillouin');
    this.ek.$fmtX = x => `x = ${x.toFixed(2)}`;
    this.ek.$fmtY = y => `E = ${y.toFixed(3)} eV`;
    const pad = Math.max(0.5, 0.08 * (R.Emax - R.Emin));
    sy.title.text = 'E (eV)'; sy.min = Math.floor(R.Emin - pad); sy.max = Math.ceil(R.Emax + pad);
    this.ek.data.datasets = [Visuals.line(R.x.map((x, i) => ({ x, y: R.E[i] })), C['accent-2'], { width: 2.6, label: 'E(k)' })];
    this.ek.options.plugins.overlays = {
      xTicks: R.ticks.map(k => ({ x: k.x, label: k.label })),
      hLines: [{ y: eA, color: 'rgba(255,181,71,.6)', dash: [3, 4], label: 'ε_A' }],
      yRanges: [{ from: R.Emin, to: R.Emax, color: 'rgba(79,209,197,.05)' }]
    };
    this.ek.update('none');
    // larghezza della banda in funzione della costante reticolare (t cresce rapidamente quando gli atomi si avvicinano)
    const aMin = Number($('tb-a').min) / 100, aMax = Number($('tb-a').max) / 100, N = 80;
    const as = Array.from({ length: N }, (_, i) => aMin + (aMax - aMin) * i / (N - 1));
    const tt = as.map(x => Physics.harrisonT(x * L.dOverA));
    const lo = tt.map(v => eA + v * L.w[0]), hi = tt.map(v => eA + v * L.w[1]);
    this.va.$fmtX = x => `a = ${x.toFixed(2)} Å`; this.va.$fmtY = y => `E = ${y.toFixed(2)} eV`;
    this.va.data.datasets = [
      Visuals.line(as.map((x, j) => ({ x, y: lo[j] })), C['accent-2'], { width: 1.2, label: '_' }),
      Visuals.line(as.map((x, j) => ({ x, y: hi[j] })), C['accent-2'], { width: 1.2, fill: '-1', fillColor: 'rgba(79,209,197,.25)', label: 'banda' })
    ];
    const span = Math.max(...hi) - Math.min(...lo);
    this.va.options.scales.y.min = Math.max(Math.min(...lo), eA - 12 - 0.2 * span); this.va.options.scales.y.max = Math.min(Math.max(...hi), eA + 12 + 0.2 * span);
    this.va.options.scales.x.min = aMin; this.va.options.scales.x.max = aMax;
    this.va.options.plugins.overlays = { vLines: [{ x: a, color: C.accent, width: 1.5, label: `a = ${fmt(a, 2)} Å` }] };
    this.va.update('none');
    const W = t * (L.w[1] - L.w[0]);
    const formula = { sc: 'E(k) = ε − 2t(cos kₓa + cos k_ya + cos k_za)', bcc: 'E(k) = ε − 8t cos(kₓa/2) cos(k_ya/2) cos(k_za/2)',
      fcc: 'E(k) = ε − 4t[cos(kₓa/2)cos(k_ya/2) + cos(k_ya/2)cos(k_za/2) + cos(k_za/2)cos(kₓa/2)]' }[lat];
    $('tb-badge').textContent = formula; $('tb-badge').className = 'badge hot';
    $('tb-readout').innerHTML = `
      <div class="row"><span>reticolo / percorso</span><b>${L.label} · ${R.ticks.map(k => k.label).join('–')}</b></div>
      <div class="row"><span>numero di primi vicini z</span><b>${L.z}</b></div>
      <div class="row"><span>d primi vicini (${M()[$('tb-mat').value].formula})</span><span>${fmt(Physics.nearestNeighbor(M()[$('tb-mat').value]), 3)} Å</span></div>
      <div class="row"><span>d = a·${{ sc: '1', bcc: '√3/2', fcc: '1/√2' }[lat]}</span><b>${fmt(d, 3)} Å</b></div>
      <div class="row"><span>t (d)</span><b>${fmt(t, 3)} eV</b></div>
      <hr>
      <div class="row"><span>estensione totale</span><b>${fmt(W, 3)} eV</b></div>
      <div class="row"><span>bordi di banda</span><span>ε ${L.w[0] < 0 ? '−' : '+'} ${Math.abs(L.w[0])}t … ε + ${L.w[1]}t</span></div>
      <div class="row"><span>m* al fondo banda = ħ²/(2ta²)</span><b>${fmt(Physics.CONST.HBAR2_2M / (t * a * a), 2)} mₑ</b></div>
      <hr><span>Un orbitale s per atomo dà una sola banda (2 stati per atomo): con un elettrone per atomo è mezza piena, quindi metallo.</span>
      <hr><span>Hopping di Harrison: |V_ssσ| = 1.40·ħ²/(m d²) = 10.67/d² eV·Å².</span>`;
  },
  update() {
    if (Physics.TB3[$('tb-chain').value]) return this.update3D();
    this.ek.options.scales.x.ticks.display = true; this.ek.options.scales.x.grid = { ...(this.ek.options.scales.x.grid || {}), display: true };
    const di = $('tb-chain').value === 'di', ph = $('tb-kind').value === 'ph';
    const C = Visuals.COLORS, n = 241;
    const ks = Array.from({ length: n }, (_, i) => -1 + 2 * i / (n - 1));
    const ds = [];
    const ext = $('tb-ext').checked;
    /** Dataset di una banda (indice n, 1-based) a partire dai valori su ks.
     *  Zona ridotta: una curva su [−π/a, π/a]. Zona estesa: la banda n va nella
     *  n-esima zona, (n−1)π/a ≤ |k| ≤ nπ/a, con due rami simmetrici. */
    const band = (E, nb, color, opts) => {
      if (!ext || nb === 1) return [Visuals.line(ks.map((k, i) => ({ x: k, y: E[i] })), color, opts)];
      const right = [];
      ks.forEach((k, i) => { if (k >= 0) right.push({ x: Physics.extendedK(k, nb), y: E[i] }); });
      right.sort((p, q) => p.x - q.x);
      const left = right.map(p => ({ x: -p.x, y: p.y })).reverse();
      return [Visuals.line(right, color, opts), Visuals.line(left, color, { ...opts, label: '_', tip: opts.tip || opts.label })];
    };
    this.ek.$fmtX = x => `k = ${x.toFixed(3)} π/a`;
    this.ek.$fmtY = y => ph ? `ν = ${y.toFixed(3)} THz` : `E = ${y.toFixed(3)} eV`;
    this.va.$fmtX = x => `a = ${x.toFixed(2)} Å`;
    this.va.$fmtY = y => `E = ${y.toFixed(2)} eV`;
    const setX = () => {
      const wide = ext && di;                  // con una sola banda lo schema esteso coincide col ridotto
      this.ek.options.scales.x.min = wide ? -2 : -1;
      this.ek.options.scales.x.max = wide ? 2 : 1;
      this.ek.options.scales.x.title.text = I18N.t(ext ? 'k (π/a) — schema a zona estesa' : 'k (π/a) — 1ª zona di Brillouin');
    };

    if (ph) {
      /* ---------------- fononi ---------------- */
      const [M1, M2] = $('tb-pair').value.split(',').map(Number), K = this.K();
      if (di) {
        const br = ks.map(k => Physics.phononDiatomic(k, K, M1, M2));
        ds.push(...band(br.map(b => b[0]), 1, C['accent-2'], { width: 2.4, label: 'ramo acustico' }));
        ds.push(...band(br.map(b => b[1]), 2, C['accent-3'], { width: 2.4, label: 'ramo ottico' }));
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
        ds.push(...band(ks.map(k => Physics.phononMono(k, K, M1)), 1, C['accent-2'], { width: 2.4, label: 'ramo acustico' }));
        this.ek.options.plugins.overlays = {};
        $('tb-readout').innerHTML = `
          <div class="row"><span>M</span><b>${M1} u</b></div>
          <div class="row"><span>ν_max = √(K/M)/π</span><b>${fmt(Physics.phononMono(1, K, M1), 3)} THz</b></div>
          <hr><span>Con un solo atomo per cella esiste solo il ramo acustico: servono 2 atomi per cella per avere un ramo ottico.</span>`;
      }
      this.ek.options.scales.y.title.text = 'ν (THz)';
      this.ek.options.scales.y.min = 0; this.ek.options.scales.y.max = undefined;
      setX();
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
        ds.push(...band(ks.map(k => track(Physics.tbMono(k, a, eA, onlyFirst))), 1, 'rgba(148,160,187,.55)', { width: 1.2, dash: [5, 4], label: 'solo t₁' }));
      }
      ds.push(...band(Ek, 1, C['accent-2'], { width: 2.6, label: 'E(k)' }));
    } else {
      const Ek = ks.map(k => Physics.tbDiatomic(k, a, eA, eB, orders).map(track));
      if (orders[1] || orders[2]) {
        const E1 = ks.map(k => Physics.tbDiatomic(k, a, eA, eB, onlyFirst).map(track));
        ds.push(...band(E1.map(e => e[0]), 1, 'rgba(148,160,187,.55)', { width: 1.2, dash: [5, 4], label: 'solo t₁' }));
        ds.push(...band(E1.map(e => e[1]), 2, 'rgba(148,160,187,.55)', { width: 1.2, dash: [5, 4] }));
      }
      ds.push(...band(Ek.map(e => e[0]), 1, C['accent-2'], { width: 2.6, label: 'banda inferiore' }));
      ds.push(...band(Ek.map(e => e[1]), 2, C['accent-3'], { width: 2.6, label: 'banda superiore' }));
    }
    const pad = Math.max(0.5, 0.08 * (Emax - Emin));
    this.ek.options.scales.y.title.text = 'E (eV)';
    this.ek.options.scales.y.min = Math.floor(Emin - pad); this.ek.options.scales.y.max = Math.ceil(Emax + pad);
    this.ek.options.plugins.overlays = {
      hLines: [{ y: eA, color: 'rgba(255,181,71,.6)', dash: [3, 4], label: 'ε_A' }].concat(di ? [{ y: eB, color: 'rgba(255,143,163,.6)', dash: [3, 4], label: 'ε_B' }] : []),
      vLines: ext && di ? [{ x: 1, color: 'rgba(148,160,187,.35)', dash: [2, 4], label: 'π/a' }, { x: -1, color: 'rgba(148,160,187,.35)', dash: [2, 4] }] : []
    };
    setX();
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
      <div class="row"><span>d primi vicini ${M()[$('tb-mat').value].formula}</span><span>${fmt(Physics.nearestNeighbor(M()[$('tb-mat').value]), 3)} Å</span></div>
      ${ext && !di ? '<hr><span>Con una sola banda lo schema esteso coincide con quello ridotto.</span>' : ''}
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
    materialSelect($('ps-atom'), 'pseudo', 'Na');
    this.t = 0;
    this.chart = Visuals.makeChart($('ps-chart'), {
      xTitle: I18N.t('r (Å) — nucleo al centro'), yTitle: 'V(r) (eV)', y2Title: 'R(r)  (Å⁻³ᐟ²)',
      x: { min: -5, max: 5 }, y: { min: -60, max: 20 }, y2: { min: -1, max: 1 }
    });
    // sviluppo di Fourier: ampiezze relative dei coefficienti di potenziale e funzione d'onda in funzione di q
    this.fqv = Visuals.makeChart($('ps-fqv'), { xTitle: 'q (Å⁻¹)', yTitle: 'Z_eff(q)', x: { min: 0, max: 20 } });
    this.fqw = Visuals.makeChart($('ps-fqw'), { xTitle: 'q (Å⁻¹)', yTitle: 'R̃(q) / R̃(q₀)', x: { min: 0, max: 10 } });
    this.fqv.$fmtX = this.fqw.$fmtX = x => `q = ${x.toFixed(2)} Å⁻¹`;
    this.fqv.$fmtY = y => `Z_eff = ${y.toFixed(2)}`;
    this.fqw.$fmtY = y => `R̃ = ${y.toFixed(3)}`;
    this.readT = bindRange('ps-t', v => v / 1000, v => `${Math.round(v * 100)} %`, () => { this.t = this.readT(); this.draw(); });
    $('ps-atom').addEventListener('change', () => this.setAtom());
    $('ps-vr').addEventListener('change', () => this.draw());
    $('ps-zoom').addEventListener('change', () => { this.buildGrid(); this.draw(); });
    $('ps-btn').addEventListener('click', () => this.animate(this.t < 0.5 ? 1 : 0));
    this.setAtom();
  },
  setAtom() {
    const key = $('ps-atom').value;
    this.sys = Physics.pseudoSystem(key);
    setNotice('pseudo', this.sys.approx
      ? I18N.t(`⚠ <b>Curva qualitativa (parametri approssimati)</b>: per ${M()[key].name.toLowerCase()} il raggio di empty core non è tabulato, si usa r<sub>c</sub> ≈ 0.4·r<sub>atomico</sub>.`)
      : null);
    const s = this.sys;
    this.buildGrid();
    this.chart.$fmtX = x => `r = ${Math.abs(x).toFixed(3)} Å`;
    this.chart.$fmtY = y => `${y.toFixed(3)}`;
    // normalizzazione della combinazione (1−t)ψ + tφ: ‖·‖² = (1−t)² + t² + 2t(1−t)⟨ψ|φ⟩
    let ov = 0; for (let i = 0; i < s.r.length; i++) ov += s.psi[i] * s.phi[i] * s.r[i] ** 2;
    this.ovPP = ov * (s.r[1] - s.r[0]);
    this.computeFourier();
    this.draw();
  },
  /** Griglia di visualizzazione simmetrica: ψ(|x|) con il nucleo al centro.
   *  Vista normale: |x| ≤ 5 Å, scala della funzione d'onda decisa dalla regione esterna (|r| > 0.15 Å): le oscillazioni
   *  nel core escono dal grafico, ed è proprio il comportamento "violento" che lo pseudopotenziale elimina.
   *  Zoom sul core: |x| ≤ 1.2 Å con griglia fitta e scala sull'ampiezza della ψ vera dentro il core, così si vedono
   *  i nodi e le oscillazioni veloci (la cuspide per r → 0 è esclusa dalla scala). */
  buildGrid() {
    const s = this.sys, zoom = $('ps-zoom').checked, xr = zoom ? 1.2 : 5, n = zoom ? 2401 : 801;
    this.xs = Array.from({ length: n }, (_, i) => -xr + 2 * xr * i / (n - 1));
    this.rr = this.xs.map(x => Math.max(Math.abs(x), 0.004));
    this.psiV = this.rr.map(r => s.interp(s.psi, r));
    this.phiV = this.rr.map(r => s.interp(s.phi, r));
    let amp = 0;
    const rIn = zoom ? Math.max(s.rMin, 0.08) : 0.15;
    this.xs.forEach((x, i) => { if (Math.abs(x) > rIn) amp = Math.max(amp, Math.abs(this.psiV[i]), Math.abs(this.phiV[i])); });
    const o = this.chart.options.scales;
    o.x.min = -xr; o.x.max = xr;
    o.y2.min = -1.3 * amp; o.y2.max = 1.3 * amp;
    // in zoom il potenziale vero diverge come −Z/r: scala verticale più ampia
    o.y.min = zoom ? -120 : -60;
  },
  /** Trasformate di Fourier (sferiche) di V e delle funzioni radiali: f(q) = 4π ∫ f(r) sin(qr)/(qr) r² dr.
   *  La parte coulombiana −Z_v e²/r si trasforma in forma chiusa (−4πZ_v e²/q²); numericamente resta solo il resto,
   *  che è a corto raggio: così la coda di 1/r non produce oscillazioni spurie dal taglio a r = 7 Å. */
  computeFourier() {
    const s = this.sys, R = s.r, dr = R[1] - R[0], Zv = s.P.Zv, E2 = Physics.CONST.E2;
    const qs = Array.from({ length: 400 }, (_, i) => 0.25 + i * 0.0625);   // 0.25 … 25.2 Å⁻¹
    const ft = f => qs.map(q => {
      let sum = 0;
      for (let i = 0; i < R.length; i++) { const r = R[i], x = q * r; sum += f(i, r) * (Math.sin(x) / x) * r * r; }
      return 4 * Math.PI * sum * dr;
    });
    const coul = qs.map(q => -4 * Math.PI * Zv * E2 / (q * q));
    this.qs = qs;
    this.F = {
      vT: ft((i, r) => s.Vtrue(r) + Zv * E2 / r).map((v, j) => v + coul[j]),
      vP: ft((i, r) => s.Vps(r) + Zv * E2 / r).map((v, j) => v + coul[j]),
      pT: ft(i => s.psi[i]), pP: ft(i => s.phi[i])
    };
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

    // sviluppo di Fourier della combinazione attuale (le trasformate sono lineari: V = (1−t)V_vero + t·V_ps, ecc.)
    const F = this.F, qs = this.qs, E2 = Physics.CONST.E2;
    const vCur = F.vT.map((v, j) => (1 - t) * v + t * F.vP[j]);
    const wCur = F.pT.map((v, j) => ((1 - t) * v + t * F.pP[j]) / norm);
    // potenziale: carica efficace Z_eff(q) = −q² v(q)/(4π e²): →Z_v per q piccolo (si vede il core + elettroni),
    // →Z per q grande nel potenziale vero (si vede il nucleo nudo), Z_v·cos(q r_c) per l'empty core
    const zEff = arr => qs.map((q, j) => ({ x: q, y: -q * q * arr[j] / (4 * Math.PI * E2) }));
    const w0 = F.pT[0] || 1;                                   // ampiezza di riferimento: ψ vera a q₀ = 0.25 Å⁻¹
    const wRel = arr => qs.map((q, j) => ({ x: q, y: arr[j] / w0 }));
    // sempre visibili: vera (tratteggio ambra/ciano), pseudo (puntinata viola) e attuale (linea piena sopra le altre)
    const dv = [
      Visuals.line(zEff(F.vT), 'rgba(255,181,71,.6)', { width: 1.5, dash: [6, 4], label: 'Z_eff vera' }),
      Visuals.line(zEff(F.vP), C['accent-3'], { width: 1.5, dash: [2, 3], label: 'Z_eff pseudo' })
    ];
    const dw = [
      Visuals.line(wRel(F.pT), 'rgba(79,209,197,.65)', { width: 1.5, dash: [6, 4], label: 'R̃(q) vera' }),
      Visuals.line(wRel(F.pP), C['accent-3'], { width: 1.5, dash: [2, 3], label: 'R̃(q) pseudo' })
    ];
    dv.push(Visuals.line(zEff(vCur), C.accent, { width: 2.6, label: 'Z_eff attuale' }));
    dw.push(Visuals.line(wRel(wCur), C['accent-2'], { width: 2.6, label: 'R̃(q) attuale' }));
    this.fqv.data.datasets = dv; this.fqw.data.datasets = dw;
    // q oltre il quale |R̃| resta sotto l'1% del massimo → energia di taglio ħ²q²/2m della base a onde piane
    const qCut = arr => {
      const m = Math.max(...arr.map(Math.abs));
      for (let j = arr.length - 1; j >= 0; j--) if (Math.abs(arr[j]) / m >= 0.01) return j === arr.length - 1 ? null : qs[j];
      return qs[0];
    };
    const cutTxt = q => (q === null ? `> ${fmt(qs[qs.length - 1], 0)} Å⁻¹` : `${fmt(q, 1)} Å⁻¹ · ${fmt(Physics.CONST.HBAR2_2M * q * q, 0)} eV`);
    const qT = qCut(F.pT), qC = qCut(wCur);
    this.fqv.options.plugins.overlays = {
      hLines: [{ y: 0, color: 'rgba(148,160,187,.4)', width: 1 }, { y: s.P.Zv, color: 'rgba(148,160,187,.35)', dash: [3, 4], width: 1, label: 'Z_v' }]
    };
    this.fqw.options.plugins.overlays = {
      hLines: [{ y: 0, color: 'rgba(148,160,187,.4)', width: 1 }],
      yRanges: [{ from: -0.01, to: 0.01, color: 'rgba(94,224,143,.14)' }],
      vLines: qC === null ? [] : [{ x: qC, color: 'rgba(94,224,143,.8)', dash: [4, 3], width: 1.3, label: `q₁% = ${fmt(qC, 1)} Å⁻¹` }]
    };
    this.fqv.update('none'); this.fqw.update('none');

    // nodi della curva attuale, contati sulla griglia fine del calcolo
    // (quella del grafico è troppo rada per i nodi interni degli atomi pesanti)
    let nodes = 0, prev = 0;
    for (let i = 0; i < s.r.length; i++) {
      const w = (1 - t) * s.psi[i] + t * s.phi[i];
      if (s.r[i] > s.rMin && prev * w < 0) nodes++;
      if (w !== 0) prev = w;
    }
    const P = s.P;
    $('ps-badge').textContent = t < 0.02 ? 'Potenziale vero · ψ con nodi' : t > 0.98 ? 'Pseudopotenziale · φ senza nodi' : `Trasformazione ${Math.round(t * 100)} %`;
    $('ps-badge').className = 'badge' + (t > 0.98 ? ' good' : t > 0.02 ? ' hot' : '');
    $('ps-readout').innerHTML = `
      <div class="row"><span>Z nucleo / Z valenza</span><b>${P.Z} / ${P.Zv}</b></div>
      <div class="row"><span>configurazione</span><span>${P.config}${P.Zv && M()[$('ps-atom').value].species.length > 1 ? ` (${P.sym})` : ''}</span></div>
      <div class="row"><span>r_c ${P.approx ? '(≈ 0.4·r atomico)' : '(Ashcroft, tabulato)'}</span><b>${fmt(P.rcBohr, 2)} a₀ = ${fmt(s.rc, 3)} Å</b></div>
      <div class="row"><span>Z_eff Slater core ${P.coreS.map(c => c.n + 's').join(', ')}</span><span>${P.core.join(', ')}</span></div>
      <div class="row"><span>Z_eff Slater valenza ${P.nv}s</span><span>${fmt(P.val, 2)}</span></div>
      <div class="row"><span>⟨ns core|φ⟩</span><span>${s.overlap.map(o => fmt(o, 3)).join(', ')}</span></div>
      <hr>
      <div class="row"><span>nodi radiali (curva attuale)</span><b class="${nodes ? 'hl' : 'ok'}">${nodes}</b></div>
      <div class="row"><span>nodi attesi per lo stato ${P.nv}s</span><span>${s.nodesExpected}</span></div>
      <div class="row"><span>V(r_c) vero</span><span>${fmt(s.Vtrue(s.rc), 1)} eV</span></div>
      <div class="row"><span>ψ vs φ a r = 2 Å</span><span>${fmt(s.interp(s.psi, 2), 3)} / ${fmt(s.interp(s.phi, 2), 3)}</span></div>
      <hr>
      <div class="row"><span>q (ψ sotto 1%) · E_cut, ψ vera</span><span>${cutTxt(qT)}</span></div>
      <div class="row"><span>q (ψ sotto 1%) · E_cut, attuale</span><b class="${t > 0.98 ? 'ok' : ''}">${cutTxt(qC)}</b></div>
      <hr><span>Fuori dal core le due funzioni quasi coincidono: è lì che avvengono legame e conduzione.</span>`;
  }
};

/* -----------------------------------------------------------------------------
 *  2.4 Bande reali 3D (pseudopotenziale empirico)
 *  Il calcolo (una diagonalizzazione per ogni punto k) richiede da 0.1 a
 *  qualche secondo: si mostra un messaggio, si lascia ridisegnare la pagina
 *  e si memorizza il risultato per non ricalcolarlo.
 * --------------------------------------------------------------------------- */
Tools.bands3d = {
  init() {
    materialSelect($('b3-mat'), 'bands3d', 'Si');
    this.cache = new Map();
    this.chart = Visuals.makeBandChart($('b3-chart'), {
      describeK: x => this.describeK(x)          // titolo del tooltip: posizione lungo il percorso
    });
    this.real = new Visuals.StructureView($('b3-real'));
    this.bz = new Visuals.StructureView($('b3-bz'));
    this.geoKey = null;
    ['b3-mat', 'b3-basis'].forEach(id => $(id).addEventListener('change', () => this.update()));
    $('b3-gap').addEventListener('change', () => this.draw());
    // zoom attorno a E_F: utile per il Bi (sovrapposizione di decine di meV) e per il cono di Dirac
    const zoom = document.createElement('label');
    zoom.className = 'check'; zoom.id = 'b3-zoom-wrap';
    zoom.innerHTML = '<input type="checkbox" id="b3-zoom"> <span id="b3-zoom-text" data-no-i18n>' + I18N.t('Ingrandisci attorno a E<sub>F</sub>') + '</span>';
    $('b3-gap').closest('label').after(zoom);
    $('b3-zoom').addEventListener('change', () => this.draw());
    this.update();
  },
  views() { return [this.real, this.bz]; },
  update() {
    const key = $('b3-mat').value, g2 = Number($('b3-basis').value);
    const st = M()[key].structure;
    // il numero di onde piane conta solo per i calcoli a onde piane; il tight binding non lo usa
    const tb = st === 'rhombohedral' || st === 'honeycomb';
    $('b3-basis').hidden = tb; $('b3-basis').previousElementSibling.hidden = tb;
    const ck = `${key}|${tb ? 0 : g2}`;
    if (this.cache.has(ck)) { this.res = this.cache.get(ck); this.draw(); return; }
    $('b3-badge').textContent = 'Calcolo in corso…';
    $('b3-badge').className = 'badge';
    $('b3-readout').innerHTML = '<span>Diagonalizzazione dell\'hamiltoniana per ogni punto k…</span>';
    // doppio requestAnimationFrame: garantisce che il messaggio sia disegnato prima del calcolo
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const t0 = performance.now();
      const res = Physics.epmBands(key, { g2max: g2 });
      res.ms = performance.now() - t0;
      this.cache.set(ck, res);
      if ($('b3-mat').value === key) { this.res = res; this.draw(); }
    }));
  },
  /** Descrive l'ascissa del percorso: "Γ→X, 45%" oppure il punto ad alta simmetria. */
  describeK(x) {
    const t = this.res.ticks;
    for (let i = 0; i + 1 < t.length; i++) {
      if (x >= t[i].x - 1e-9 && x <= t[i + 1].x + 1e-9) {
        const f = (x - t[i].x) / ((t[i + 1].x - t[i].x) || 1);
        if (f < 0.01) return `k = ${t[i].label}`;
        if (f > 0.99) return `k = ${t[i + 1].label}`;
        const from = t[i].label.split(',').pop(), to = t[i + 1].label.split(',')[0];
        return `k: ${from}→${to} ${Math.round(f * 100)}%`;
      }
    }
    return `x = ${x.toFixed(3)}`;
  },
  /** Vista 3D della struttura e della zona di Brillouin (solo se cambia il materiale). */
  showGeometry(key) {
    if (this.geoKey === key) return;
    this.geoKey = key;
    const geo = Physics.crystalGeometry(key);
    this.real.showReal(geo);
    this.bz.showBZ(geo);
    const pts = [...new Set(geo.path.flatMap(([a, b]) => [a, b]))].map(p => p === 'G' ? 'Γ' : p);
    $('b3-real-label').textContent = '· ' + geo.cellLabel;
    $('b3-bz-label').textContent = '· punti: ' + pts.join(', ');
    this.real.autoSpin = this.bz.autoSpin = true;
  },
  /** Mostra nel pannello dei controlli le considerazioni sul materiale scelto. */
  showNote(key) {
    const store = $('b3-note-store');
    const src = store.querySelector(`[data-mat="${key}"]`) || store.querySelector('[data-mat="*"]');
    const box = $('b3-notes');
    box.replaceChildren(src.cloneNode(true));
    typeset(box);
  },
  draw() {
    const r = this.res, C = Visuals.COLORS, info = r.info, key = $('b3-mat').value, mat = M()[key];
    this.showGeometry(key);
    this.showNote(key);
    const show = $('b3-gap').checked;
    const zoomable = !!(info.semimetal || info.dirac);
    $('b3-zoom-wrap').hidden = !zoomable;
    const zoom = zoomable && $('b3-zoom').checked;
    $('b3-title').textContent = 'Bande reali lungo ' + r.ticks.map(t => t.label.replace(/,/g, '|')).join(' → ');
    const xmax = r.x[r.x.length - 1];
    const P = r.P, filled = P.filled || 0;
    this.chart.data.datasets = r.bands.map((b, i) => {
      // valenza in ciano, conduzione in viola (per il metallo: un colore per banda)
      const col = info.metal ? C.series[i % C.series.length] : (i < filled ? C['accent-2'] : C['accent-3']);
      // ogni banda ha un'etichetta vera (letta dal tooltip); in legenda compare
      // solo la prima di ogni gruppo, per non affollarla
      const label = info.metal ? `Banda ${i + 1}` : `Banda ${i + 1} (${i < filled ? 'valenza' : 'conduzione'})`;
      const inLegend = info.metal ? i === 0 : (i === 0 || i === filled);
      const ds = Visuals.line(r.x.map((x, j) => ({ x, y: b[j] })), col, { width: 2, label });
      ds.hideInLegend = !inLegend;
      ds.legendText = I18N.t(info.metal ? 'bande' : (i === 0 ? 'bande di valenza' : 'bande di conduzione'));
      return ds;
    });
    this.chart.options.scales.x.max = xmax;
    // asse Y senza massimo rigido: si estende a tutte le bande calcolate
    // (suggestedMin/Max fissano solo l'estensione minima della finestra)
    const allE = r.bands.flat();
    const y = this.chart.options.scales.y;
    delete y.min; delete y.max; delete y.suggestedMin; delete y.suggestedMax;
    if (zoom) {
      const w = info.semimetal ? 0.12 : 1.0;
      y.min = -w; y.max = w;
    } else if (info.semimetal) {
      // Bi: le bande s a −10 eV schiacciano la figura; si mostra la finestra dei livelli p
      y.min = -4; y.max = 4;
    } else {
      y.suggestedMin = Math.min(-14, Math.floor(Math.min(...allE)) - 1);
      y.suggestedMax = Math.max(15, Math.ceil(Math.max(...allE)) + 1);
    }
    const ov = { xTicks: r.ticks.map(t => ({ x: t.x, label: t.label })), hLines: [] };
    if (info.metal) {
      ov.hLines.push({ y: 0, color: C.accent, dash: [6, 4], label: 'E_F' });
    } else if (info.semimetal) {
      ov.hLines.push({ y: 0, color: C.accent, dash: [6, 4], label: 'E_F' });
      if (show) {
        ov.markers = [
          { x: info.vbm.x, y: info.Eh, color: C.accent, label: 'T: lacune', below: false },
          { x: info.cbm.x, y: info.Ee, color: C.danger, label: 'L: elettroni', below: true }
        ];
        ov.yRanges = [{ from: info.Ee, to: info.Eh, color: 'rgba(255,181,71,.16)' }];
      }
    } else if (info.dirac) {
      ov.hLines.push({ y: 0, color: C.accent, dash: [6, 4], label: 'E_F = E_Dirac' });
      if (show) ov.markers = [{ x: info.xK, y: 0, color: C.ok, label: 'cono di Dirac (K)', below: true }];
    } else if (show) {
      const vbm = { x: info.vbm.x, y: 0 }, cbm = { x: info.cbm.x, y: info.cbm.E };
      ov.yRanges = [{ from: 0, to: info.gap, color: 'rgba(255,107,129,.10)' }];
      ov.markers = [
        { x: vbm.x, y: vbm.y, color: C.accent, label: 'VBM', below: true },
        { x: cbm.x, y: cbm.y, color: C.danger, label: 'CBM' }
      ];
      ov.arrows = [{ x1: vbm.x, y1: vbm.y, x2: cbm.x, y2: cbm.y, color: info.direct ? C.ok : C.danger,
        label: `${fmt(info.gap, 2)} eV ${info.direct ? 'diretta' : 'indiretta'}` }];
    }
    this.chart.options.plugins.overlays = ov;
    this.chart.update('none');

    // avvisi sul modello usato
    if (info.semimetal) {
      setNotice('bands3d', I18N.t('⚠ Modello <b>tight binding sp³ con spin-orbita</b> sul reticolo A7 vero, parametri nello stile di Liu &amp; Allen (PRB 52, 1566): riproduce l\'ordine di grandezza di sovrapposizione e gap in L, non è un fit quantitativo.'));
    } else if (info.dirac) {
      setNotice('bands3d', I18N.t('⚠ Solo le bande <b>π</b> (orbitali p<sub>z</sub>), tight binding con primi (t) e secondi (t′) vicini: le bande σ non sono mostrate.'));
    } else if (info.metal) {
      const base = info.approx
        ? 'Modello semplificato: elettrone quasi libero sul reticolo vero, con pseudopotenziale empty core schermato (parametri approssimati).'
        : 'Metallo semplice: pseudopotenziale locale a due coefficienti (Ashcroft), più semplice del modello usato per i semiconduttori.';
      const d = info.transition ? ' ' + I18N.t('<b>Mancano le bande d</b>, essenziali in questo metallo: la figura mostra solo la banda s(p).') : '';
      setNotice('bands3d', `⚠ ${I18N.t(base)}${d}${info.note ? ' ' + I18N.t(info.note) : ''}`);
    } else setNotice('bands3d', null);

    const badge = $('b3-badge');
    const latName = { fcc: 'CFC', bcc: 'CCC', sc: 'SC', hcp: 'esagonale compatta', rhombohedral: 'romboedrica (A7)', honeycomb: 'nido d\'ape 2D' }[r.lattice];
    const meV = v => fmt(v * 1000, 1);
    if (info.semimetal) {
      badge.textContent = `${mat.name}: semimetallo · sovrapposizione ${meV(info.overlap)} meV`;
      badge.className = 'badge good';
      $('b3-readout').innerHTML = `
        <div class="row"><span>reticolo / percorso</span><b>${latName} · ${r.ticks.map(t => t.label).join('–')}</b></div>
        <div class="row"><span>sovrapposizione T→L</span><b class="hl">${meV(info.overlap)} meV</b></div>
        <div class="row"><span>  sperimentale</span><span>≈ 38 meV</span></div>
        <div class="row"><span>gap diretta in L</span><b>${meV(info.gapL)} meV</b></div>
        <div class="row"><span>  sperimentale</span><span>≈ 15 meV</span></div>
        <div class="row"><span>gap diretta in T</span><span>${meV(info.gapT)} meV</span></div>
        <hr>
        <div class="row"><span>massimo di valenza</span><b>${info.EhAt}: +${meV(info.Eh)} meV</b></div>
        <div class="row"><span>minimo di conduzione</span><b>${info.EeAt}: ${meV(info.Ee)} meV</b></div>
        <div class="row"><span>densità n = p (neutralità)</span><b>${(info.nCm3 / 1e17).toFixed(1)}×10¹⁷ cm⁻³</b></div>
        <div class="row"><span>distanze dei gusci</span><span>${info.shellDist.map(d => d.toFixed(2)).join(' · ')} Å</span></div>
        <hr><span>${I18N.t('Tasca di lacune a T (1) ed elettroni a L (3): E<sub>F</sub> è fissato da n = p. Attiva «Ingrandisci attorno a E<sub>F</sub>» per vedere le bande incrociarsi.')}</span>
        <hr><div class="row"><span>tempo</span><span>${fmt(r.ms, 0)} ms</span></div>`;
    } else if (info.dirac) {
      badge.textContent = `${mat.name}: gap nulla · cono di Dirac in K`;
      badge.className = 'badge good';
      $('b3-readout').innerHTML = `
        <div class="row"><span>reticolo / percorso</span><b>${latName} · ${r.ticks.map(t => t.label).join('–')}</b></div>
        <div class="row"><span>gap in K</span><b class="ok">0 eV (Dirac)</b></div>
        <div class="row"><span>t (primi vicini)</span><b>${fmt(info.t, 2)} eV</b></div>
        <div class="row"><span>t′ (secondi vicini)</span><span>${fmt(info.t2, 2)} eV</span></div>
        <div class="row"><span>a<sub>CC</sub></span><span>${fmt(info.a_cc, 3)} Å</span></div>
        <div class="row"><span>v<sub>F</sub> = 3·t·a<sub>CC</sub>/2ħ</span><b class="hl">${fmt(info.vF / 1e6, 2)}×10⁶ m/s</b></div>
        <div class="row"><span>E(π*) in M</span><span>${fmt(info.EM, 2)} eV</span></div>
        <hr><span>${I18N.t("Dispersione lineare E = ±ħv<sub>F</sub>|q| attorno a K: fermioni di Dirac senza massa. L'asimmetria tra le due bande viene da t′.")}</span>`;
    } else if (info.metal) {
      badge.textContent = `${mat.name}: metallo · ${info.crossing} band${info.crossing === 1 ? 'a attraversa' : 'e attraversano'} E_F`;
      badge.className = 'badge good';
      $('b3-readout').innerHTML = `
        <div class="row"><span>reticolo / percorso</span><b>${latName} · ${r.ticks.map(t => t.label).join('–')}</b></div>
        <div class="row"><span>elettroni / atomo (Z_v)</span><b>${P.zv}</b></div>
        <div class="row"><span>k_F (elettrone libero)</span><b>${fmt(info.kF, 3)} Å⁻¹</b></div>
        <div class="row"><span>E_F sopra il fondo banda</span><b>${fmt(-Math.min(...r.bands[0]), 2)} eV</b></div>
        ${info.shells.map(sh => sh.label
          ? `<div class="row"><span>${sh.label}</span><span>${fmt(sh.V, 3)} ${sh.unit || 'eV'}</span></div>`
          : `<div class="row"><span>V(|G|² = ${+sh.q2.toFixed(2)})</span><span>${fmt(sh.V, 4)} Ry</span></div>`).join('')}
        <hr>
        <span>Le bande sono quasi parabole libere ripiegate nella zona di Brillouin: il potenziale debole apre solo piccoli gap e alcune bande tagliano il livello di Fermi. Niente gap → metallo.</span>
        <hr><div class="row"><span>onde piane / tempo</span><span>${r.nG} / ${fmt(r.ms, 0)} ms</span></div>`;
    } else {
      badge.textContent = `${mat.name}: gap ${info.direct ? 'DIRETTA' : 'INDIRETTA'} · ${fmt(info.gap, 2)} eV`;
      badge.className = 'badge ' + (info.direct ? 'good' : 'hot');
      $('b3-readout').innerHTML = `
        <div class="row"><span>gap sperimentale (300 K)</span><b class="hl">${fmt(P.expGap, 2)} eV</b></div>
        <div class="row"><span>gap calcolata (EPM)</span><span>${fmt(info.gap, 3)} eV</span></div>
        <div class="row"><span>tipo</span><b class="${info.direct ? 'ok' : 'hl'}">${info.direct ? 'diretta' : 'indiretta'}</b></div>
        <hr>
        <div class="row"><span>massimo di valenza</span><b>${info.vbm.where}</b></div>
        <div class="row"><span>minimo di conduzione</span><b>${info.cbm.where}</b></div>
        <div class="row"><span>gap diretta minima</span><span>${fmt(info.directGap, 2)} eV in ${info.directAt}</span></div>
        <hr>
        <div class="row"><span>fattori V_S (Ry)</span><span>${Object.entries(P.VS).map(([q, v]) => `V${q}=${v}`).join(' ')}</span></div>
        ${Object.keys(P.VA).length ? `<div class="row"><span>fattori V_A (Ry)</span><span>${Object.entries(P.VA).map(([q, v]) => `V${q}=${v}`).join(' ')}</span></div>` : ''}
        <div class="row"><span>onde piane / tempo</span><span>${r.nG} / ${fmt(r.ms, 0)} ms</span></div>`;
    }
  }
};

/* =============================================================================
 *  AVVIO
 *  Gli script con "defer" sono eseguiti in ordine prima di DOMContentLoaded,
 *  quindi qui THREE, Chart, Physics e Visuals sono già definiti (se caricati).
 * ============================================================================= */
document.addEventListener('DOMContentLoaded', () => {
  window.__appStarted = true;
  Theory.pristine = { theory: $('theory-store').innerHTML, notes: $('b3-note-store').innerHTML };   // testo italiano originale
  I18N.add(window.I18N_STATIC || {});
  I18N.init();
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
  I18N.onChange(() => {
    Theory.rebuild();
    const z = $('b3-zoom-text'); if (z) z.innerHTML = I18N.t('Ingrandisci attorno a E<sub>F</sub>');
    const T = state.tool && Tools[state.tool];
    if (T && T.ready && T.update) T.update();
  });
  Theory.init();
  initBadges();
  initTextGlue();
  route();
});
