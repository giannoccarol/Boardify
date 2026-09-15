# Clip Taxonomy

Boardify ha UNA tassonomia di categorie smart. Le pill in alto NON sono predefinite:
`CategoryPills` mostra solo le categorie con `count > 0`, quindi una categoria
compare solo quando l'utente ha davvero copiato qualcosa di quel tipo.

## Tassonomia attuale

| Categoria | Matcher (`src-tauri/src/detect.rs`) | Auto-assign (`db.rs` `insert_text`) |
|---|---|---|
| History | — (sempre) | ogni clip |
| Snippet | `is_code` (kind `code`) | kind `code` |
| Link | `is_link` (kind `link`) | kind `link` |
| QR Code | `is_qr_payload` (link + `WIFI:`/`otpauth://`/`BEGIN:VCARD`) | kind `link`, + testi che matchano |
| Email | `is_email` | testi che matchano |
| Template | `is_template` (`{{var}}`, `${var}`, `[PLACEHOLDER]`, `%s/%d`) | testi che matchano |
| Video | `is_video_url` (youtube/vimeo/mp4/mov/webm/m4v) | link + testi che matchano |
| Colors | `is_color` (kind `color`) | kind `color` |
| Assets | kind `image` | kind `image` |
| File | kind `file` | kind `file` |

Seed + rename storici + backfill link in `db.rs` `migrate()`.
Tag di ricerca in `src/settings.ts` (`KIND_TAGS`/`CATEGORY_TAGS`, es. `@video`, `@email`),
filtrati in `src/store.ts`; faccette preview in `src/components/ClipPreview.tsx`
con helper in `src/smartActions.ts`.

## Checklist: gestiamo una cosa nuova (es. audio, PDF, password)?

1. Aggiungi helper `is_<cosa>` in `detect.rs` + un caso nel test `smart_facets`.
2. Aggiungi la categoria al seed in `migrate()` (nome, colore) e al mapping in `insert_text`.
3. Se serve backfill dei vecchi clip, fallo solo per `kind` (mai euristiche costose in SQL oltre un `LIKE`).
4. Aggiungi un clip demo in `src/demo.ts` (+1 al count di `History` e della categoria).
5. Se serve, aggiungi `@tag` in `CATEGORY_TAGS`/`KIND_TAGS` e badge/azione in `ClipPreview`.
6. Aggiorna la tabella sopra. Nient'altro: le pill si accendono da sole (count > 0).
