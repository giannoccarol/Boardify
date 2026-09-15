# UI Motion

Come restare a 60fps nello shelf e nella library.

## Regole

- **Solo `transform` + `opacity` animati.** Mai width/height/blur/margin. Il resto è CSS statico.
- **Spring da `src/motion.ts`**: `spring` (default), `snappy` (hover/pill), `soft` (pannelli). `cardDelay(i)` = `min(i,10)*0.026` per stagger liste.
- **Classi `gpu` + `glass`** su ogni pannello flottante (`will-change`, `translateZ(0)`, shadow fissa).
- Liste: `motion.layout` + `AnimatePresence mode="popLayout"`, exit rapidi (~0.12s). Niente spinner su refetch realtime.
- `useReducedMotion` per keyframe d'ingresso (Shelf/Library lo fanno già).
- Immagini: `loading="lazy"`, `draggable={false}`, dimensioni via CSS fissa della card (`clipSizeClass`).
- Search: debounce 140 ms in store, mai animare sui keystroke.

> Windows-compat: le regole sopra sono OS-agnostic (WebView2 su Windows come WebKit su Linux).
> Testare gli overlay fullscreen/trasparenti (shelf/capture) anche su Windows: scala DPI diversa
> e comportamento `transparent`/`alwaysOnTop` possono differire.

## Checklist nuovo componente animato

1. Parte da uno spring esistente? Se no, motivo.
2. Solo transform/opacity nei variant? Backdrop-blur solo statico.
3. `exit` definito? Senza, popLayout scatta.
4. Testato con 30+ card + reduced-motion on?
