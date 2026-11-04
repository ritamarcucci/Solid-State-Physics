# Solid State Lab — Design System

Bozza visiva: `design/preview.html` (apri nel browser). Questo file è la fonte di verità per ogni modifica a `css/style.css`, `index.html` e ai colori letti da `js/visuals.js`.

## 1. Idea guida

**"Guarda dentro la materia."** Il sito deve sembrare uno strumento scientifico di fascia alta (pensa a un'interfaccia di laboratorio, non a una pagina di appunti). Tre principi:

1. **La fisica è l'estetica.** Reticoli, spazio reciproco e bande non sono decorazioni: sono la grafica. Ogni schermata ha almeno un elemento che si muove perché la fisica lo fa muovere.
2. **Buio profondo + luce che significa qualcosa.** Sfondo quasi nero; i colori accesi hanno ruoli fissi (vedi palette), mai usati a caso.
3. **Vetro e profondità.** Superfici in vetro scuro, bagliori morbidi, spotlight che segue il mouse: dà l'effetto "wow" senza appesantire.

## 2. Palette

Stessi nomi delle variabili CSS attuali (`visuals.js` li legge: non rinominarli).

| Variabile | Valore | Ruolo semantico |
|---|---|---|
| `--bg` | `#05070f` | sfondo pagina |
| `--bg-2` | `#080c18` | sidebar, pannelli controlli |
| `--panel` / `--panel-2` | `#0d1324` / `#131b33` | card, gruppi di controlli |
| `--line` / `--line-2` | `#1d2842` / `#2c3b61` | bordi sottili / bordi in evidenza |
| `--text` / `--muted` / `--faint` | `#eef2fb` / `#9aa7c4` / `#66739a` | testo primario / secondario / etichette |
| `--accent` | `#ffb547` ambra | **fascio X, livello di Fermi, valori numerici, CTA primaria** |
| `--accent-2` | `#4fd1c5` ciano | **atomi/nodi, banda inferiore, eyebrow, link attivi** |
| `--accent-3` | `#9d8cff` viola | **banda superiore, seconda serie dati** |
| `--ok` / `--danger` | `#5ee08f` / `#ff6b81` | condizione soddisfatta (Bragg) / errore |

**Gradiente firma** (titoli enfatizzati): `linear-gradient(100deg, #ffb547, #ff7a8a 45%, #9d8cff)`.
**Aurora di sfondo**: 3 radial-gradient sfocati (ciano in alto a sinistra, viola in alto a destra, ambra in basso) con deriva lenta di 18 s.

## 3. Tipografia

| Uso | Font | Note |
|---|---|---|
| Titoli, numeri grandi | **Space Grotesk** 500–700 | `letter-spacing: -.035em` a partire da 36px, `line-height` 0.92–1.05 |
| Testo | **Inter** 400–600 | 16px / 1.6 |
| Dati, etichette, eyebrow | **JetBrains Mono** 400–600 | MAIUSCOLO con `letter-spacing: .14–.18em` per le etichette; `tabular-nums` per i valori |

Scala: hero `clamp(52px, 10vw, 128px)` · sezione `clamp(36px, 5.5vw, 64px)` · card `clamp(30px, 4vw, 42px)` · lead 18–19px · etichette 11–13px.

Per aggiungere Space Grotesk: `family=Space+Grotesk:wght@500;600;700` nel link Google Fonts di `index.html`.

## 4. Layout e forme

- Contenitore `min(1180px, 100% - 48px)`; sezioni con padding verticale `clamp(80px, 12vw, 150px)`.
- Raggi: pillole `99px` (nav, badge, bottoni) · card grandi `28px` · gruppi controlli `14px`.
- Bordi sempre 1px; le card hanno un "bordo sfumato" (padding 1px su gradiente `--line-2 → --line`).
- Ombre lunghe e colorate sulle superfici chiave: `0 50px 120px -40px rgba(79,209,197,.25)`.

## 5. Componenti

### Navbar
Pillola fluttuante centrata (`top: 14px`), vetro (`rgba(16,23,44,.55)` + `backdrop-filter: blur(18px) saturate(1.4)`), logo con rombo a gradiente, CTA ambra a destra.

### Hero
Schermo intero. Sfondo: aurora + trama di punti con maschera radiale. In primo piano un **reticolo FCC 3D su canvas** che ruota lentamente e reagisce al mouse (parallasse); gli atomi "caldi" ambra hanno un alone. Titolo gigante su due righe, la seconda con il gradiente firma. Pill di stato con puntino verde pulsante. Due CTA: primaria ambra, secondaria vetro con bordo.

### Striscia statistiche
4 numeri grandi con gradiente che contano da 0 al valore quando entrano in vista (moduli, strumenti, reticoli, "0 build/npm/server" — è un punto di forza: sito statico).

### Card modulo (spotlight)
Un riflesso radiale colorato segue il cursore sul bordo (`--mx/--my` aggiornati in `pointermove`) e uno più tenue sulla superficie. Hover: `translateY(-8px)`, freccia che scorre. Ogni card ha un colore proprio (`--c`): ciano per Cristallografia, viola per Bande. Illustrazione SVG animata (curve che si disegnano con `stroke-dashoffset`, atomo caldo che pulsa).

### Demo live (la parte che fa dire "uao")
Pannello 1.6fr (canvas) + 1fr (controlli). Due esperimenti con fisica reale, non video:
- **Bande**: modello a elettrone quasi libero. `E±(k) = (E₀(k)+E₀(k−G))/2 ± √[((E₀(k)−E₀(k−G))/2)² + V²]`. Lo slider V apre il gap `Eg = 2V`; la fascia ambra mostra il gap, il badge passa da Metallo → Semiconduttore → Isolante.
- **Ewald 2D**: reticolo reciproco ruotato + cerchio di raggio `1/λ` che passa per l'origine. I nodi sulla circonferenza (condizione di Bragg) si accendono in giallo con alone. Sliders per λ e rotazione (rotazione automatica finché non la tocchi).

### Controlli — REGOLA: ogni slider ha anche il campo numerico
**Ogni parametro regolabile deve poter essere inserito sia con lo slider sia digitando il valore esatto.** Nessuno slider "da solo", in nessuno strumento (reticoli, Ewald, polveri, Kronig–Penney, tight binding, pseudopotenziale, bande 3D) e in nessuna demo.
- Layout: `[ slider ———— ] [ 0.35 eV ]` sulla stessa riga; il campo è una pillola `--panel-2` con numero mono ambra allineato a destra e unità accanto. L'`<output>` testuale dell'etichetta viene nascosto (sarebbe un doppione).
- Sincronizzazione bidirezionale: muovere lo slider aggiorna il campo; digitare aggiorna lo slider e il grafico subito, mentre si scrive (se il valore è valido).
- Validazione: valore fuori da `min`/`max` o non numerico → bordo `--danger` e nessun aggiornamento; a Invio/blur il valore viene riportato nell'intervallo (clamp) con le cifre decimali dello `step`.
- Focus: bordo ambra con alone; frecce ↑/↓ cambiano di uno `step`; niente spinner nativi.
- Se il valore cambia da codice (es. rotazione automatica) il campo si aggiorna, tranne quando l'utente sta scrivendo.
- Nel sito reale esiste già `.range-row` / `.num-input` / `.num-unit` in `css/style.css`: il nuovo stile li restyle, non li sostituisce.

Slider con traccia riempita in ambra e thumb luminoso (`box-shadow` ambra, `scale(1.25)` in `:active`). Valore in mono ambra, a destra dell'etichetta. Box dati `readout` in mono con valori chiave in `--accent`.

### Area di lavoro (strumenti)
Layout invariato (sidebar · scena 2/3 · controlli 1/3) ma ritoccato: voce attiva con gradiente ambra a sinistra e numero su pillola ambra; scena su fondo `radial-gradient(#101a33 → --bg-2)`; tag di contesto in alto a sinistra sulla scena; gruppi controlli in vetro scuro.

## 6. Movimento

| Elemento | Effetto |
|---|---|
| Sezioni | `reveal`: opacity 0 → 1 + `translateY(34px)`, 0.9 s `cubic-bezier(.2,.8,.2,1)`, via IntersectionObserver |
| Hero | reticolo che ruota + parallasse al mouse; aurora che deriva |
| Numeri | count-up 1.2 s con easing cubico |
| Card | spotlight + sollevamento |
| Grafici | ridisegno a ogni `input`, mai a scatti |

Rispettare sempre `prefers-reduced-motion` (rotazioni ferme, nessuna transizione).

## 7. Regole da non violare

1. Colori con significato fisico fisso (ambra = fascio/Fermi/valori, ciano = nodi/banda bassa, viola = banda alta).
2. Mai più di 3 colori accesi nella stessa scena.
3. Testo su `--bg`: contrasto minimo 4.5:1 (`--muted` e `--text` lo rispettano; `--faint` solo per etichette secondarie).
4. Nessuna libreria nuova per le animazioni: canvas 2D, SVG e CSS bastano. Il sito resta statico, senza build.
5. Ogni slider ha il suo campo numerico per il valore esatto (vedi Controlli).
6. Mobile first sotto 880px: card in colonna, sidebar orizzontale, demo con controlli sotto la scena.

## 8. Piano di applicazione al sito reale

1. `css/style.css`: aggiornare i valori `:root` (stessi nomi), aggiungere `--display` e il gradiente firma, nuove regole per nav, hero, card spotlight, slider.
2. `index.html`: aggiungere Space Grotesk, il canvas hero e la striscia statistiche nella `#view-home`; una navbar sulla home.
3. `js/main.js`: spostare qui il reticolo hero, il reveal e il count-up (codice già pronto in `design/preview.html`).
4. Verificare che `js/visuals.js` legga ancora correttamente le variabili colore dopo la modifica.
5. Controllare su mobile (375px) e con `prefers-reduced-motion`.
