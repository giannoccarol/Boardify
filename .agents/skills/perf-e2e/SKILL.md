# Perf E2E

Ogni feature visibile si chiude con un test Playwright che ne misura la velocità.
Niente "sembra fluido": numeri e budget, altrimenti la regressione entra in silenzio.

## Quando scrivere il test

- Nuova vista, lista, filtro, search, preview per tipo, animazione d'ingresso.
- NON per logica pura: quella va in unit test (Rust: `cargo test`, TS: casi in `detect.rs` ↔ `smartActions.ts`).
- NON per backend Tauri (watcher/tray/shortcut): gli e2e girano su Vite + `src/demo.ts`, senza Rust.

## Come misurare (`e2e/helpers/perf.ts`)

- `measureUntil(action, ready)` — cronometra fino a che la UI riflette il cambio
  (include debounce store 140 ms + render: è ciò che sente l'utente).
- `sampleFrames(page, ms, during)` — rAF sampling durante scroll/animazione,
  ritorna avg/p95 dei delta. p95 alto = jank.
- `watchConsole(page)` — zero `pageerror`/`console.error` a fine test. Sempre.
- Selettori indipendenti dalla lingua (classi `.clip-card`, `.shelf-search input`),
  mai testo i18n. Determinismo con `?shot=1` (animazioni off); le misure di frame
  invece girano SENZA `shot`, ad animazioni accese.

## Budget attuali (dev-server locale, headless)

| Misura | Budget | Nota |
|---|---|---|
| shelf/library render (server caldo) | 3000 ms | Il primo giro scalda Vite e non si misura |
| shelf open / close (cambio vista) | 3000 ms | proxy del mount/unmount window Tauri |
| frecce tra clipboard (per passo) | 800 ms | dopo blur della search (ha l'autofocus) |
| hover menu per-card → opacity 1 | 800 ms | senza `?shot`, animazione vera |
| azione pin → `is-active` | 800 ms | |
| preview open / close | 1500 / 800 ms | close include exit 0.08s |
| copia-come per kind (preview) | 1500 ms | filtra per kind e aspetta il filtro prima del click |
| pill / filtri toolbar | 1200 ms | |
| delete → count-1 | 1200 ms | include exit 0.12s |
| fav / pin → `is-active` | 800 ms | |
| copy → conferma | 1500 ms | serve permesso `clipboard-write` nel test |
| nota open / create | 800 / 1200 ms | `Ctrl+Shift+N`, poi `Ctrl+Enter` |
| settings render / panel / switch / recorder | 3000 / 800 / 800 / 1200 ms | recorder nel pannello keyboard |
| search → lista aggiornata | 1500 ms | include debounce 140 ms |
| scroll p95 frame | 120 ms | headless usa SwiftShader: è smoke anti-jank, non 60fps |

Due progetti in config: `default` + `reduced` (stessi spec con
`reducedMotion: reduce`, valida il percorso `useReducedMotion` di ui-motion).

Limite onesto: gli e2e girano su Vite + demo, senza backend Tauri.
Tray, shortcut globali, watcher e show/hide nativo restano fuori
(servirebbe tauri-driver). La demo ha un overlay in `store.ts`
(`demoFav`/`demoPin`/`demoDeleted`/`demoNotes`) così le mutazioni
sopravvivono ai refresh come col DB vero.

## Mock pesante (`?heavy=N`)

`src/demo.ts` genera N clip deterministiche (seed fisso, kind misti,
immagini incluse): `/?view=library&heavy=300`. Usalo per il lavoro di
fluidità, mai per gli assert funzionali (numeri fissi solo dopo la baseline).

Lezioni misurate (300 clip, library, headless):

| Ipotesi | Risultato | Decisione |
|---|---|---|
| Memoize parser puri | 0% (925→936ms) | revert |
| `layout` framer off | 0% | no (erano le animazioni da tenere) |
| Azioni hover montate sempre → solo su hover/focus (`AnimatePresence` + exit) | longtask total −50% (925→460ms) | tenuto, stessi fade |
| `content-visibility: auto` su `.clip-card`/`.clip-row` | −20% sul resto (571→460ms) | tenuto, stessi pixel |

Regola: un'ipotesi per cambio, numero prima/dopo, se non migliora si reverta
(come sopra). Le animazioni non si toccano: si taglia il lavoro invisibile
(nodi nascosti, paint fuori viewport), mai il motion design.

Calibrazione: fai girare 3× in locale, budget ≈ 2× il peggiore. In CI (headless,
macchine lente) i budget sono larghi apposta: beccano regressioni 5-10×, non il 20%.

## Ottimizzare (measure-first)

1. Profila: aggiungi la misura che manca, riporta il numero prima/dopo nel messaggio.
2. Ipotesi singola per cambio (spring, debounce, lazy, memo, chunk). Mai due insieme.
3. Se il numero non migliora, revert. Niente ottimizzazioni "preventive".

## Anti-flake

- 1 worker (`workers: 1` già in config), mai `sleep` fissi: solo `expect` con polling.
- Dopo `fill` nella search, aspetta SEMPRE lo stato filtrato (count/kind) prima di
  cliccare: c'è il debounce 140 ms e il click finirebbe sulla card pre-filtro.
- Mai stringere un budget per far passare la CI: si allarga con motivazione o si fixa il codice.
- Debug: `npx playwright test --headed`, trace automatico al primo retry (`trace: on-first-retry`).

## Comandi

```bash
npm run e2e              # tutta la suite (Vite su :1422, riusa :1422 se già su)
E2E_PORT=1425 npm run e2e
npx playwright test e2e/shelf.spec.ts   # un file
```
