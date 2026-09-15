# Dev Workflow

Come sviluppare e verificare Boardify senza rompersi.

## Modalità

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Solo UI su :1420, dati finti da `src/demo.ts` (`isTauri() === false`). Per UI/preview/skin veloci. |
| `npm run tauri dev` | App vera: Rust + watcher + SQLite reale. Serve per ingestion, shortcut, tray. |
| `npx tsc --noEmit` | Typecheck. Sempre prima di commit. |
| `cargo test … detect` | `cargo test --manifest-path src-tauri/Cargo.toml detect` — euristiche. Primo build ~1 min, poi cache. |
| `npm run tauri build` | Bundle (AppImage/deb/rpm) in `src-tauri/target/release/bundle/`. Solo a release. |
| `npm run shots` | PNG del README in `docs/shots/` (Chromium + ImageMagick, Vite su :1421). |

## Cose da sapere

- **Finestre** via `?view=shelf|library|capture|settings`, config in `tauri.conf.json`. Shelf/capture: fullscreen trasparenti always-on-top.
- **Realtime:** backend emette `clips-changed` / `window-shown` / `open-note`; store rifà `refresh`/`search` senza spinner.
- **Suppress-on-copy:** `copy_clip` alza `suppress_once` così il watcher non re-importa ciò che incolliamo noi.
- **Settings** persistiti con plugin-store (`settings.json`) e applicati al watcher via `apply_watch_settings`.
- **Wayland:** niente iniezione `Ctrl+V` senza portal → copia + hide, l'utente incolla. Niente comandi privilegiati per sviluppare.
- **DB locale:** `~/.local/share/boardify/clips.db` (+`images/`). Per azzerare: bottone "Svuota history" o `invoke("clear_history")`.
