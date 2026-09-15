# AGENTS.md — Boardify

Clipboard manager Tauri v2 + React per Linux. Local-first: niente network tranne oEmbed/iframe nelle preview.

## Comandi (prima di dire "fatto")

```bash
npx tsc --noEmit                                        # sempre
cargo test --manifest-path src-tauri/Cargo.toml detect  # se tocchi detect.rs
npm run dev    # solo UI, dati finti da src/demo.ts (preview senza Tauri)
npm run tauri dev  # app vera
```

## Regole dure

- **Categorie smart, mai hardcodate.** Una categoria per cosa gestita, auto-assign in `db.rs`, euristiche in `detect.rs`, pill con `count > 0` già gestito. Leggi `.agents/skills/clip-taxonomy/SKILL.md` e aggiornala a ogni nuova categoria (tabella + checklist).
- **Specchio Rust ⇄ TS.** Le euristiche `detect.rs` hanno gemelle in `src/smartActions.ts` (preview) e tag in `src/settings.ts` (`KIND_TAGS`/`CATEGORY_TAGS`). Se cambi una, cambia le altre.
- **Animazioni solo transform + opacity.** Spring da `src/motion.ts`, classi `gpu`/`glass`. Vedi `.agents/skills/ui-motion/SKILL.md`.
- **DB:** migrazioni in `db.rs::migrate`, mai breaking senza rename/backfill. SQLite in `~/.local/share/boardify/clips.db`.
- **Wayland:** dopo il copy non iniettare tasti, l'utente preme `Ctrl+V`. Niente `sudo`/comandi privilegiati per testare.
- **Mai commit/push senza permesso esplicito.** Dipendenze morte: rimuoverle (`fuse.js` docet).

## Dove sta cosa

- Ingestion: `watcher.rs` → `detect.rs` (kind/faccette/sensitive) → `db.rs::insert_text` (auto-categorie)
- Filtri search: `settings.ts::parseSearch` → `store.ts` (`refresh`/`search`/`applyClientFilters`)
- Preview per tipo: `ClipPreview.tsx` + `linkMeta/linkActions/smartActions/color/units/code.ts`
- Finestre `?view=shelf|library|capture|settings` (App.tsx), config in `tauri.conf.json`
