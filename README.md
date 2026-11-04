# Solid State Lab

Laboratorio web interattivo di fisica dello stato solido: cristallografia, diffrazione e teoria delle bande.
HTML + CSS + JavaScript vanilla; Three.js, Chart.js e MathJax caricati da CDN. Nessun build, nessun npm.

## Struttura
```
index.html        struttura della SPA e testi di teoria
css/style.css     tema, layout (sidebar + 2/3 grafica + 1/3 controlli), animazioni
js/physics.js     costanti, database materiali, tutte le equazioni (testabile con Node)
js/visuals.js     scene Three.js, grafici Chart.js, rivelatore Canvas 2D
js/i18n.js        selettore IT | EN: traduce i testi a runtime (nodi di testo, attributi, grafici)
js/i18n-static.js traduzioni inglesi dei testi di index.html (UI, teoria, note)
js/i18n-dyn.js    traduzioni inglesi dei testi prodotti da main.js / physics.js (pannelli dati, badge, materiali)
js/home-fx.js     effetti della Home (reticolo 3D hero, reveal, contatori); vedi design/design.md
js/main.js        navigazione con hash (#/cryst/lattice …) e controller degli strumenti
```

## Avvio locale
Serve un server statico (i moduli caricano file locali):
```
python3 -m http.server 8000
```
poi apri http://localhost:8000

## Deploy su Vercel
1. Carica la cartella su un repository GitHub.
2. Su vercel.com → *Add New Project* → importa il repository.
3. Framework preset: **Other**, nessun build command, output directory: la radice.

## Fonti dei dati
- Bismuto (bande 3D): tight binding sp³ con spin-orbita sull'A7 nello stile di Liu & Allen, PRB 52, 1566 (1995); parametri non verificati sulla tabella originale, validati su sovrapposizione T–L, gap in L e densità di portatori sperimentali
- Grafene (bande 3D): π di primi e secondi vicini, t = 2.8 eV, t′ = 0.1 eV (valori standard della letteratura)
- Costanti reticolari, temperature di Debye: Kittel, *Introduction to Solid State Physics*
- Elettroni di valenza: Ashcroft & Mermin, Tab. 1.1
- Fattori di forma atomici (Cromer-Mann): *International Tables for Crystallography* Vol. C, Tab. 6.1.1.4
- Hopping ssσ: regola universale di Harrison (η = −1.40)
- Raggi di empty core: N. W. Ashcroft, Phys. Lett. 23, 48 (1966)

## Test rapido della fisica
```
node -e "const P=require('./js/physics.js'); console.log(P.STRUCTURES.fcc.apfIdeal)"
```
