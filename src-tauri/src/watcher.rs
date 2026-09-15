//! Polling clipboard (Wayland+X11). Text + immagini. Dedup via hash.

use crate::db::{images_dir, ClipRow, Db};
use crate::detect;
use arboard::Clipboard;
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Manager;

fn hash_text(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    format!("{:x}", h.finalize())[..16].to_string()
}

fn lock(m: &Arc<Mutex<String>>) -> std::sync::MutexGuard<'_, String> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn active_app() -> (String, String) {
    crate::source::active_app()
}

pub fn ingest_text(
    db: &Arc<Mutex<Db>>,
    text: &str,
    source_app: &str,
    window_title: &str,
    last_hash: &mut String,
) -> Result<ClipRow, String> {
    let t = text.trim();
    if t.is_empty() || t.chars().count() > 100_000 {
        return Err("vuoto/troppo grande".into());
    }
    let h = hash_text(t);
    if h == *last_hash {
        return Err("duplicato".into());
    }
    *last_hash = h.clone();
    let kind = detect::detect_kind(t);
    let color = detect::extract_color(t);
    let sensitive = detect::is_sensitive(t);
    let db = db.lock().map_err(|e| e.to_string())?;
    let (row, fresh) = db
        .insert_text(kind, t, source_app, window_title, &h, sensitive, color.as_deref(), None)
        .map_err(|e| e.to_string())?;
    if !fresh {
        return Err("duplicato".into());
    }
    Ok(row)
}

fn ingest_image(
    db_arc: &Arc<Mutex<Db>>,
    rgba: &[u8],
    width: usize,
    height: usize,
    source_app: &str,
    window_title: &str,
    last_hash: &mut String,
) -> Result<(), String> {
    use image::{ImageBuffer, Rgba};
    let mut h = Sha256::new();
    h.update(rgba);
    let hash = format!("{:x}", h.finalize())[..16].to_string();
    if width < 32 || height < 32 {
        return Err("piccola".into());
    }
    if hash == *last_hash {
        return Err("duplicato".into());
    }
    *last_hash = hash.clone();
    let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
        ImageBuffer::from_raw(width as u32, height as u32, rgba.to_vec())
            .ok_or("immagine non valida")?;
    let fname = format!("{}.png", uuid::Uuid::new_v4());
    let path = images_dir().join(&fname);
    img.save(&path).map_err(|e| e.to_string())?;
    let text = format!("[Immagine {}x{}]", width, height);
    let (row, fresh) = {
        let db = db_arc.lock().map_err(|e| e.to_string())?;
        db.insert_text(
            "image",
            &text,
            source_app,
            window_title,
            &hash,
            false,
            None,
            Some(path.to_string_lossy().as_ref()),
        )
        .map_err(|e| e.to_string())?
    };
    if !fresh {
        return Err("duplicato".into());
    }
    if let Ok(out) = std::process::Command::new("tesseract")
        .args([path.to_string_lossy().as_ref(), "stdout", "-l", "eng+ita"])
        .output()
    {
        let ocr = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !ocr.is_empty() {
            if let Ok(db) = db_arc.lock() {
                let _ = db.set_ocr(&row.id, &ocr);
            }
        }
    }
    Ok(())
}

pub fn run_loop(app: tauri::AppHandle) {
    let state: tauri::State<crate::AppState> = app.state();
    let db = state.db.clone();
    let last_hash = state.last_hash.clone();
    let last_seen = state.last_seen.clone();
    let suppress = state.suppress_once.clone();
    let watch = state.watch.clone();
    drop(state);

    // Clipboard può fallire su Wayland senza display; retry lazy
    let mut clipboard: Option<Clipboard> = Clipboard::new().ok();
    // seed: non importare ciò che è già nella clipboard all'avvio? invece sì, una volta.
    let mut first = true;

    loop {
        std::thread::sleep(Duration::from_millis(700));
        if clipboard.is_none() {
            clipboard = Clipboard::new().ok();
            if clipboard.is_none() {
                continue;
            }
        }
        let cb = clipboard.as_mut().unwrap();

        // Se abbiamo appena fatto copy-to-clipboard noi, salta un giro
        let settings = watch.lock().unwrap_or_else(|e| e.into_inner()).clone();
        if !settings.auto_capture {
            first = false;
            continue;
        }

        if *suppress.lock().unwrap_or_else(|e| e.into_inner()) {
            *suppress.lock().unwrap_or_else(|e| e.into_inner()) = false;
            // Riallinea gli hash a ciò che abbiamo scritto (copy_clip li ha già impostati).
            let img_hash = cb.get_image().ok().map(|img| {
                let mut h = Sha256::new();
                h.update(&img.bytes);
                format!("{:x}", h.finalize())[..16].to_string()
            });
            let text_hash = cb.get_text().ok().map(|t| hash_text(t.trim()));
            let has_img = img_hash.is_some();
            if let Some(ih) = img_hash {
                *last_hash.lock().unwrap_or_else(|e| e.into_inner()) = ih;
            }
            if let Some(th) = text_hash {
                *last_seen.lock().unwrap_or_else(|e| e.into_inner()) = th.clone();
                if !has_img {
                    *last_hash.lock().unwrap_or_else(|e| e.into_inner()) = th;
                }
            } else if has_img {
                // Clipboard solo-immagine: dimentica il testo compagno precedente.
                *last_seen.lock().unwrap_or_else(|e| e.into_inner()) = String::new();
            }
            continue;
        }

        let ignored = || {
            let (app_name, _) = active_app();
            settings
                .ignored_apps
                .iter()
                .any(|a| app_name.to_lowercase().contains(&a.to_lowercase()))
        };

        let text = cb.get_text().ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let text_hash = text.as_ref().map(|t| hash_text(t));
        let text_new = match &text_hash {
            Some(h) => first || h != &*lock(&last_hash) && h != &*lock(&last_seen),
            None => false,
        };

        // L'immagine va cercata quando cambia qualcosa (una copia immagine porta
        // quasi sempre anche un testo/URL compagno) oppure ogni ~3 giri per le
        // copie di sola immagine (es. screenshot), dove il testo resta uguale.
        static mut TICK: u8 = 0;
        let tick = unsafe {
            TICK = TICK.wrapping_add(1);
            TICK
        };
        let mut changed = false;
        if text_new || tick % 3 == 0 || first {
            if let Ok(img) = cb.get_image() {
                let mut h = Sha256::new();
                h.update(&img.bytes);
                let ih = format!("{:x}", h.finalize())[..16].to_string();
                if first || ih != *lock(&last_hash) {
                    let (app_name, title) = active_app();
                    // Registra comunque: evita di riprovare lo stesso contenuto.
                    *lock(&last_hash) = ih.clone();
                    if let Some(th) = &text_hash {
                        *lock(&last_seen) = th.clone();
                    }
                    if !ignored() {
                        if ingest_image(&db, &img.bytes, img.width, img.height, &app_name, &title, &mut lock(&last_hash)).is_ok() {
                            changed = true;
                        }
                    }
                    first = false;
                }
            }
        }

        if !changed {
            if let (Some(t), Some(h)) = (text, text_hash) {
                if first || h != *lock(&last_hash) && h != *lock(&last_seen) {
                    let (app_name, title) = active_app();
                    *lock(&last_seen) = h.clone();
                    if !ignored() {
                        match ingest_text(&db, &t, &app_name, &title, &mut lock(&last_hash)) {
                            Ok(_) => changed = true,
                            Err(_) => {}
                        }
                    }
                    first = false;
                }
            }
        }

        if changed {
            crate::notify_new_clip(&app);
        }
    }
}
