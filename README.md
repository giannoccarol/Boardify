# 📋 Boardify

**Clipboard manager visuale, locale e fluidissimo per Linux.** Copi qualcosa → appare nello shelf. Fine.

Clone open di Supaste, costruito per chi vive di copia-incolla: history visuale, categorie che si accendono da sole, ricerca istantanea, incolla ovunque. Zero cloud, tutto in `~/.local/share/boardify`.

## ✨ Funzionalità

**Cattura automatica**
- Watcher clipboard (testo + immagini, poll 700 ms su Wayland/X11) con dedup via hash
- Riconosce l'app di origine su Hyprland, niri, Sway, KDE e X11 + icone reali dal tema Freedesktop
- OCR immagini con tesseract, screen-text da regione (`slurp`+`grim` o `spectacle`), color picker esterno (`hyprpicker`/`kcolorchooser`)
- Rileva contenuti sensibili (password, API key, token, carte, chiavi private) e li oscura nelle card
- App ignorabili, auto-eliminazione vecchi clip, toast di conferma dopo ogni copia

**Categorie smart** — non predefinite: compaiono solo se hai copiato qualcosa di quel tipo
- `Snippet · Link · QR Code · Email · Template · Video · Colors · Assets · File` + le tue custom
- Auto-assegnate all'ingestion (euristiche locali in `detect.rs`, con migrazione e backfill dei vecchi clip)

**Shelf notch** (`Ctrl+Shift+V`)
- Search istantanea, pill smart, quick note (`Ctrl+Shift+N`), preview con `Spazio`, `Invio` = copia

**Libreria** (`Ctrl+Shift+L`)
- Viste card / lista / board per categoria, dettaglio con azioni, copia formattata (Plain/ABC/abc/Abc), multi-selezione + combina, pin, preferiti, drag & drop nelle app

**Preview intelligenti**
- Link: embed YouTube/Vimeo, titolo via oEmbed, copia Markdown/HTML, **QR code generato in locale**
- Colori: swatch, formati HEX/RGB/HSL, armonie, contrasto WCAG
- Email/telefoni/indirizzi/path → azioni dirette (mailto, tel, mappe, rivela file)
- Template: chip per ogni placeholder (`{{nome}}`, `[N]`, `%s`) da copiare al volo
- Unità: timestamp→data, px↔rem, °C↔°F, kg↔lb, km↔mi · Video mp4 diretti riproducibili
- Inline shortcuts `;nome` assegnabili e ricercabili

**Ricerca** — FTS5 + fallback, debounce 140 ms, tag `@video @email @template @qrcode @code @snippet @firefox…`

## ⌨️ Scorciatoie globali

| Tasti | Azione |
|---|---|
| `Ctrl+Shift+V` | Shelf |
| `Ctrl+Shift+L` | Libreria |
| `Ctrl+Shift+0–9` | Incolla uno degli ultimi 10 |
| `Ctrl+Shift+N / S / P / T` | Nota · cattura manuale · colore · testo da schermo |

## 🛠 Sviluppo

```bash
npm install
npm run dev              # solo UI (demo senza Tauri)
npx tsc --noEmit         # typecheck
cargo test --manifest-path src-tauri/Cargo.toml detect   # euristiche
npm run tauri dev        # app completa
npm run tauri build      # bundle in src-tauri/target/release/bundle/
```

Serve per Tauri/WebKit: `webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module gtk3 librsvg libvips patchelf tesseract`. Su Wayland dopo il copy premi `Ctrl+V` (l'iniezione tasti non è permessa senza portal).

## 🗂 Struttura

```
src/
  App.tsx · store.ts (zustand) · settings.ts · types.ts
  code.ts · color.ts · units.ts · linkMeta.ts · linkActions.ts · smartActions.ts
  motion.ts (spring 60fps) · demo.ts (preview senza Tauri)
  components/ Shelf · Library · ClipPreview · ClipCard · CategoryPills · CaptureBar · Settings · AppBadge
src-tauri/src/
  main.rs (comandi, tray, shortcut, finestre) · db.rs (SQLite+FTS5) ·
  detect.rs (euristiche) · watcher.rs (polling) · source.rs (app attiva) · icons.rs
.agents/skills/  clip-taxonomy · dev-workflow · ui-motion
```

Stack: Tauri v2 + Rust · React + Vite + Tailwind v4 + Framer Motion + Zustand · SQLite WAL + FTS5.

## 🗺 Roadmap

Reminders schedulati · screenshot watcher · inline expansion via portal · sync via Syncthing/Nextcloud (mai cloud proprietari).
