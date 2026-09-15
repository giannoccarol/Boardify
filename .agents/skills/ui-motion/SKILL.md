---
name: ui-motion
description: >-
  Progetta e verifica le animazioni di Boardify: shelf elastica dal bordo superiore,
  menu contestuali, preview e feedback dei comandi. Usare per modifiche a motion,
  transizioni e microinterazioni della UI React/Tauri.
---

# UI Motion — Boardify

La shelf definisce il linguaggio: una superficie nasce da un'origine precisa,
si deforma, rivela il contenuto e si assesta. I controlli riprendono lo stesso
carattere con escursioni e tempi proporzionati alla loro frequenza d'uso.

## Vincoli del renderer

- Animare **solo `transform` e `opacity`**: `x/y`, `scaleX/scaleY`, `scale`,
  `rotate`. Mai `width`, `height`, padding, margin, border-radius, blur o shadow.
- Centralizzare variant e transizioni in `src/motion.ts`. Partire da `spring`
  (default), `snappy` (controlli), `soft` (pannelli). Motivare i parametri diversi.
- `gpu` e `glass` sui pannelli flottanti; sfondi, raggi e ombre restano statici.
  Un riflesso è un gradiente statico mosso con transform/opacity, senza blur animato.
- Per sequenze con più pose usare tween/keyframe, poi uno spring per l'assestamento.
  Non passare tre o più keyframe a uno spring fisico di Framer Motion.

## Come costruire l'apertura a bolla

1. **Origine.** La shelf nasce dal centro del bordo superiore (`transform-origin:
   50% 0`). Un menu nasce dal suo pulsante: scegliere il lato/origine coerente con
   il posizionamento. La preview si sviluppa sotto la clip/shelf.
2. **Sagoma prima del contenuto.** Partire piccoli e fuori dal bordo; deformare
   prima la superficie. Tenere testi e icone trasparenti nella fase più compressa,
   poi farli entrare con una breve traslazione e opacità.
3. **Squash/stretch.** Separare gli assi: la shelf si allarga mantenendo poca
   altezza, poi si gonfia verso il basso. Una piccola capsula con raggio statico
   può fare da raccordo visivo fra il bordo e la finestra.
4. **Assestamento.** Un solo rimbalzo leggibile, circa 3–6% sulla shelf; più piccolo
   sui menu. Il contenuto deve essere utilizzabile prima che finisca la coda della
   molla. Evitare oscillazioni continue o ritardi cumulativi sulle card.
5. **Chiusura inversa.** Nascondere il contenuto, comprimere in altezza, stringere
   in larghezza e rientrare nell'origine. Mantenere il nodo montato fino a fine exit.

La sequenza della shelf vive in `shelfVariants`, `shelfSeedVariants`,
`shelfContentVariants` e `shelfGleamVariants`. È un riferimento concreto da
riutilizzare, non una durata obbligatoria per tutti i componenti.

## Scala del movimento

| Interazione | Trattamento | Tempi orientativi |
|---|---|---|
| Apertura shelf | Capsula → fascia → gonfiamento elastico | 300 ms di emersione + molla |
| Chiusura shelf | Compressione → capsula → uscita dal bordo | Circa 500 ms complessivi |
| Menu delle clip / Copia come | Espansione dall'angolo del trigger, piccolo overshoot, contenuto appena sfalsato | 160–280 ms; exit 120–180 ms |
| Preview | Crescita dall'alto e breve discesa, minore deformazione della shelf | 200–350 ms; exit 150–200 ms |
| Pulsante | Pressione corta (scale ~0.9–0.95) e ritorno con `snappy` | Risposta immediata |
| Copia riuscita | Icona copy → check con piccolo pop e conferma leggibile | 160–240 ms; conferma ~1 s |
| Pin / preferito | Piccolo pop dell'icona al cambio di stato | 150–220 ms |

I tempi sono scelte di design da verificare, non timeout per azioni asincrone.
Una copia parte subito al click: mostrare successo **solo dopo** che il risultato
è positivo. Non ritardare il comando per far terminare la pressione del pulsante.
Ripetere il feedback anche su copie consecutive e ripulire timer alla dismissione.
Riservare spazio a icone/etichette per evitare salti di layout.

## Lifecycle e interruzioni

- `AnimatePresence` per menu/preview; definire `exit` sul nodo animato e montare
  soltanto i controlli necessari. Un `exit` senza presence non ritarda l'unmount.
- Le finestre Tauri restano montate mentre sono nascoste: riprodurre il motion su
  `window-shown` con animation controls, senza cambiare la key dell'intero albero.
  Preservare input, scroll, selezione e stato delle clip.
- La richiesta di chiusura nativa avvia il motion; il vero `hide()` viene dopo.
  Coprire Escape, backdrop, copia con chiusura, tray e shortcut. Una riapertura
  invalida la vecchia chiusura e gli eventuali fallback: nessun hide ritardato
  deve nascondere una finestra appena riaperta.
- Interrompere sequenze precedenti con un identificatore di esecuzione o cleanup.
  Gestire doppio click/close senza avviare più sequenze concorrenti. Durante
  l'uscita impedire input sui controlli ormai invisibili.
- Tastiera e mouse devono usare lo stesso percorso. Escape chiude prima il menu
  interno, poi la preview, poi la shelf. Non sottrarre focus per decorazioni.

## Liste, accessibilità e prestazioni

- Scroll: usare lo scrolling nativo del browser (`scrollTo`/`scrollBy`), senza
  tween di `scrollLeft` né trasformazioni dell'intera lista. Conservare il gesto
  orizzontale e l'inerzia del trackpad; convertire la rotella verticale soltanto
  sulle righe che hanno overflow. Accumulare la destinazione fra scatti, annullarla
  al cambio di direzione o al tocco e lasciare propagare il gesto ai bordi.
  `reduce` usa spostamenti immediati. Nessun render React per frame di scroll.
  La navigazione a frecce mantiene visibile la clip selezionata e si ferma alle
  card effettivamente presenti nella shelf.

- Liste: `layout` + `AnimatePresence mode="popLayout"`, exit ~120 ms.
  `cardDelay(i) = min(i, 10) * 0.026` limita lo stagger. Niente spinner su refetch.
- Search: debounce 140 ms nello store; non riavviare il pannello a ogni carattere.
- Immagini lazy, non trascinabili nella shelf e con dimensioni CSS fisse.
- Con `useReducedMotion`, niente deformazione, sequenze o attese decorative:
  mostrare direttamente lo stato finale. La conferma di successo resta visibile.
  `?shot=1` deve produrre una UI statica, completamente leggibile.
- Non ridisegnare liste o montare centinaia di controlli nascosti per un effetto.
  Se una misura peggiora, individuare il lavoro costoso prima di cambiare budget.
- Windows/WebView2 e Linux/WebKit condividono questo codice. Verificare anche
  clipping, DPI, ombre e fullscreen trasparente; dichiarare se il test è solo Chromium.

## Verifica prima di chiudere il lavoro

Seguire [perf-e2e](../perf-e2e/SKILL.md): spec in `e2e/` con `measureUntil`,
`sampleFrames` e `watchConsole`, in modalità normale e reduced-motion.

- Misurare fino allo stato finale, non soltanto fino alla presenza nel DOM.
- Campionare frame durante l'effetto reale, senza `shot`; riscaldare la vista
  prima delle misure e separare il costo di navigazione da quello dell'animazione.
- Coprire 30+ card, apertura/chiusura ripetuta e interruzione durante l'apertura.
- Controllare copia riuscita/fallita, focus, Escape e nessuna riapertura sulla search.
- Ispezionare visivamente origine, pose intermedie e stato finale. Riportare numeri
  misurati e limiti del test senza equiparare lo smoke headless a 60 fps nativi.
- `npx tsc --noEmit` e `npm run e2e` devono passare.
