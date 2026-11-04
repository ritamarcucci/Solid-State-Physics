/* =============================================================================
 *  i18n.js — italiano (predefinito) / inglese
 * =============================================================================
 *  Il sito è scritto in italiano. In inglese ogni testo viene sostituito a
 *  runtime con la traduzione trovata nei dizionari:
 *    - I18N_STATIC (i18n-static.js): testi di index.html, chiave = italiano normalizzato
 *    - I18N_DYN    (i18n-dyn.js)   : etichette e frasi prodotte da main.js / physics.js
 *    - regole (RegExp)              : frasi con numeri e nomi di materiali
 *  Si traduce a livello di nodo di testo (e degli attributi title / aria-label /
 *  label), quindi il codice dell'applicazione non cambia: un MutationObserver
 *  traduce anche i pannelli che vengono riscritti a ogni movimento di uno slider.
 *  I.t(testo) serve per le stringhe disegnate su canvas (grafici).
 *  I.missing() elenca i testi italiani senza traduzione (utile in sviluppo).
 * ============================================================================= */
const I18N = (() => {
  'use strict';
  const DICT = new Map();
  const RULES = [];
  const SKIP = 'script, style, textarea, code, mjx-container, [data-no-i18n]';
  const ATTRS = ['title', 'aria-label', 'placeholder', 'label'];
  const missing = new Set();
  const listeners = [];
  let lang = 'it', observer = null, busy = false;

  const norm = s => s.replace(/[ ⁠]/g, ' ').replace(/\s+/g, ' ').trim();
  const looksItalian = s => /[àèéìòù]|\b(il|la|le|di|del|della|dei|che|per|con|non|una|nel|nella|sono|più|come|quando|solo|tra|gli|ogni|banda|bande|reticolo|valore|atomi|raggio|picco|picchi|elettroni|metallo|piani|massimo|minimo)\b/i.test(s);

  function add(obj) { for (const [k, v] of Object.entries(obj)) DICT.set(norm(k), v); }
  function rule(re, fn) { RULES.push([re, fn]); }

  /** Traduce una stringa (qualsiasi, anche con numeri). In italiano restituisce l'originale. */
  function t(s) {
    if (lang === 'it' || typeof s !== 'string' || !s) return s;
    const k = norm(s);
    if (!k) return s;
    let r = DICT.get(k);
    if (r === undefined) for (const [re, fn] of RULES) { const m = k.match(re); if (m) { r = fn(m, k); break; } }
    if (r === undefined) { if (looksItalian(k)) missing.add(k); return s; }
    return s.match(/^\s*/)[0] + r + s.match(/\s*$/)[0];
  }

  /* ---- DOM ---- */
  const accept = n => (n.parentElement && !n.parentElement.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT);
  function translateText(n) {
    const v = n.nodeValue;
    if (!v || !/[A-Za-zàèéìòù]{2,}/.test(v)) return;
    if (n.__it === undefined) {
      const r = t(v);
      if (r !== v) { n.__it = v; n.__en = r; n.nodeValue = r; }
    } else if (v !== n.__en) {                // il codice ha riscritto il nodo: si riparte dal nuovo testo
      delete n.__it; delete n.__en; translateText(n);
    }
  }
  function translateAttrs(el) {
    for (const a of ATTRS) {
      if (!el.hasAttribute || !el.hasAttribute(a)) continue;
      const key = '__it_' + a, cur = el.getAttribute(a);
      if (el[key] !== undefined && cur === el[key + 'en']) continue;
      const r = t(cur);
      if (r !== cur) { el[key] = cur; el[key + 'en'] = r; el.setAttribute(a, r); }
    }
  }
  function apply(root) {
    if (lang !== 'en' || !root) return;
    if (root.nodeType === 3) { if (accept(root) === NodeFilter.FILTER_ACCEPT) translateText(root); return; }
    if (root.nodeType !== 1) return;
    if (root.closest && root.closest(SKIP)) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: accept });
    for (let n = w.nextNode(); n; n = w.nextNode()) translateText(n);
    translateAttrs(root);
    root.querySelectorAll('[title],[aria-label],[placeholder],[label]').forEach(translateAttrs);
  }
  function restore() {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.__it !== undefined) { n.nodeValue = n.__it; delete n.__it; delete n.__en; }
    document.querySelectorAll('[title],[aria-label],[placeholder],[label]').forEach(el => {
      for (const a of ATTRS) { const key = '__it_' + a; if (el[key] !== undefined) { el.setAttribute(a, el[key]); delete el[key]; delete el[key + 'en']; } }
    });
  }
  function observe() {
    if (observer) return;
    observer = new MutationObserver(list => {
      if (lang !== 'en' || busy) return;
      busy = true;
      for (const m of list) {
        if (m.type === 'characterData') apply(m.target);
        else if (m.type === 'attributes') translateAttrs(m.target);
        else m.addedNodes.forEach(nd => apply(nd));
      }
      observer.takeRecords();
      busy = false;
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  /* ---- cambio lingua ---- */
  function set(l, { silent } = {}) {
    l = l === 'en' ? 'en' : 'it';
    const changed = l !== lang;
    lang = l;
    try { localStorage.setItem('ssl-lang', l); } catch (e) { /* storage non disponibile */ }
    document.documentElement.lang = l;
    document.title = l === 'en' ? 'Solid State Lab — Crystallography and Band Theory' : 'Solid State Lab — Cristallografia e Teoria delle Bande';
    const md = document.querySelector('meta[name="description"]');
    if (md) {
      if (!md.__it) md.__it = md.getAttribute('content');
      md.setAttribute('content', l === 'en' ? t(md.__it) : md.__it);
    }
    document.querySelectorAll('.lang-toggle button').forEach(b => {
      const on = b.dataset.lang === l; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (!silent && changed) listeners.forEach(f => f(l));
    if (l === 'en') { busy = true; apply(document.body); busy = false; } else restore();
  }
  function init() {
    let l = 'it';
    try {
      const q = new URLSearchParams(location.search).get('lang');
      const saved = localStorage.getItem('ssl-lang');
      l = q === 'en' || q === 'it' ? q : (saved || ((navigator.language || 'it').toLowerCase().startsWith('it') ? 'it' : 'en'));
    } catch (e) { /* predefinito: italiano */ }
    observe();
    document.querySelectorAll('.lang-toggle button').forEach(b => b.addEventListener('click', () => set(b.dataset.lang)));
    lang = 'it';                      // si parte dall'italiano e si applica subito la lingua scelta
    set(l, { silent: true });
  }

  return {
    add, rule, t, init, set, apply, norm,
    get lang() { return lang; },
    onChange: f => listeners.push(f),
    missing: () => [...missing]
  };
})();
