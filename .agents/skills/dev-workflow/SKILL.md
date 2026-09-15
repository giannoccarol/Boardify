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
- **DB locale:** `~/.local/share/boardify/clips.db` (Linux) / `%APPDATA%\boardify\clips.db` (Windows), +`images/`. Per azzerare: bottone "Svuota history" o `invoke("clear_history")`.

## Windows-compat (obbligatoria per ogni feature)

Boardify compila e gira su Linux E Windows. Regole:

- **Mai codice Unix-only senza fallback.** Niente `std::os::unix`, path assoluti (`/usr/...`), shell-out Linux (`sh`, `hyprctl`, `grim`, `slurp`, `spectacle`, `qdbus`...) nel path condiviso. Pattern obbligatorio:
  ```rust
  #[cfg(target_os = "linux")]
  fn feature_x() -> ... { /* hyprctl/grim/... */ }
  #[cfg(target_os = "windows")]
  fn feature_x() -> ... { /* API Windows o Err("... non ancora supportato su Windows") */ }
  ```
  Il fallback Windows deve compilare e degradare con messaggio chiaro all'utente, mai panic.
- **Dipendenze OS-only** solo in `[target.'cfg(target_os = "linux")'.dependencies]` (es. `zbus`). Quelle cross-platform (`arboard`, `active-win-pos-rs`, `dirs`, `image`) restano in `[dependencies]`.
- **Stato per-OS (dove sta cosa):**

  | Area | Linux | Windows |
  |---|---|---|
  | Finestra attiva (`source.rs`) | Hyprland/niri/Sway/KDE/X11 | `active-win-pos-rs` (foreground window), fallback `Unknown` |
  | Icone app (`icons.rs`) | Freedesktop (temi + `.desktop`) | stub → `None` (TODO: estrarre icone `.exe`) |
  | Color picker | `hyprpicker`/`kcolorchooser`/`gpick` | non supportato, errore chiaro |
  | OCR/screenshot testo | `slurp`+`grim` / `spectacle` + `tesseract` | non supportato, errore chiaro (`tesseract` resta cross-platform) |
  | Watcher clipboard | `arboard` poll 500 ms | stesso codice |
  | DB / immagini | `dirs::data_dir()` | stesso codice |
  | Shortcut globali | Tauri `global-shortcut` (`Super` = tasto Win su Windows) | stesso codice, testare la stringa su entrambi |
- **Verifica:** oltre a `tsc` + `cargo test`, prima di dire "fatto" su codice Rust toccato da OS-specific: `cargo check` e, se il target è installato, `cargo check --target x86_64-pc-windows-msvc`. Niente `#[cfg]` senza aver controllato entrambi i rami (almeno a vista + test della logica pura).
