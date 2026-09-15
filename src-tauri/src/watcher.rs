//! Clipboard locale, immagini prima del testo e dedup solo dopo il salvataggio.

use crate::db::{images_dir, ClipRow, Db};
use crate::detect;
use arboard::{Clipboard, ImageData};
use sha2::{Digest, Sha256};
use std::path::Path;
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::Manager;

pub fn hash_text(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.trim().as_bytes());
    format!("{:x}", h.finalize())[..16].to_string()
}

pub fn hash_image(img: &ImageData<'_>) -> String {
    let mut h = Sha256::new();
    h.update(b"boardify-rgba-v1");
    h.update((img.width as u64).to_le_bytes());
    h.update((img.height as u64).to_le_bytes());
    h.update(&img.bytes);
    format!("{:x}", h.finalize())[..16].to_string()
}

pub enum Snapshot {
    Image(ImageData<'static>),
    Text(String),
}

impl Snapshot {
    pub fn hash(&self) -> String {
        match self {
            Self::Image(img) => hash_image(img),
            Self::Text(text) => hash_text(text),
        }
    }
}

// The browser often offers both image/png and a URL. Never import the companion
// text after finding an image, including when that image is already in history.
trait ClipboardReader {
    fn image(&mut self) -> Result<ImageData<'static>, arboard::Error>;
    fn files(&mut self) -> Result<Vec<std::path::PathBuf>, arboard::Error>;
    fn text(&mut self) -> Result<String, arboard::Error>;
}
impl ClipboardReader for Clipboard {
    fn image(&mut self) -> Result<ImageData<'static>, arboard::Error> {
        self.get_image()
    }
    fn files(&mut self) -> Result<Vec<std::path::PathBuf>, arboard::Error> {
        self.get().file_list()
    }
    fn text(&mut self) -> Result<String, arboard::Error> {
        self.get_text()
    }
}
pub fn read_snapshot(cb: &mut Clipboard) -> Result<Option<Snapshot>, String> {
    read_from(cb)
}
fn read_from(cb: &mut impl ClipboardReader) -> Result<Option<Snapshot>, String> {
    match cb.image() {
        Ok(img) => return Ok(Some(Snapshot::Image(img))),
        Err(arboard::Error::ContentNotAvailable) => {}
        Err(e) => return Err(format!("Lettura immagine dagli appunti: {e}")),
    }
    if let Ok(paths) = cb.files() {
        if let Some(img) = single_image_file(&paths) {
            return img.map(|img| Some(Snapshot::Image(img)));
        }
    }
    match cb.text() {
        Ok(text) if !text.trim().is_empty() => Ok(Some(Snapshot::Text(text))),
        Ok(_) | Err(arboard::Error::ContentNotAvailable) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn single_image_file(paths: &[std::path::PathBuf]) -> Option<Result<ImageData<'static>, String>> {
    if paths.len() != 1 || !paths[0].is_file() {
        return None;
    }
    let reader = image::ImageReader::open(&paths[0])
        .ok()?
        .with_guessed_format()
        .ok()?;
    reader.format()?;
    Some(
        reader
            .decode()
            .map(|img| {
                let rgba = img.to_rgba8();
                ImageData {
                    width: rgba.width() as usize,
                    height: rgba.height() as usize,
                    bytes: rgba.into_raw().into(),
                }
            })
            .map_err(|e| format!("File immagine non leggibile: {e}")),
    )
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
    let kind = detect::detect_kind(t);
    let color = detect::extract_color(t);
    let sensitive = detect::is_sensitive(t);
    let db = db.lock().map_err(|e| e.to_string())?;
    let (row, _) = db
        .insert_text(
            kind,
            t,
            source_app,
            window_title,
            &h,
            sensitive,
            color.as_deref(),
            None,
        )
        .map_err(|e| e.to_string())?;
    *last_hash = h;
    Ok(row)
}

fn ingest_image(
    db: &Arc<Mutex<Db>>,
    img: &ImageData<'_>,
    source_app: &str,
    window_title: &str,
    last_hash: &mut String,
    dir: &Path,
) -> Result<ClipRow, String> {
    let width = u32::try_from(img.width).map_err(|_| "larghezza non valida")?;
    let height = u32::try_from(img.height).map_err(|_| "altezza non valida")?;
    let len = img
        .width
        .checked_mul(img.height)
        .and_then(|n| n.checked_mul(4));
    if width == 0 || height == 0 || len != Some(img.bytes.len()) {
        return Err("immagine non valida".into());
    }
    let hash = hash_image(img);
    // Content-addressed files avoid orphan PNGs on duplicate captures/retries.
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{hash}.png"));
    let rgba = image::RgbaImage::from_raw(width, height, img.bytes.to_vec())
        .ok_or("immagine non valida")?;
    rgba.save(&path).map_err(|e| e.to_string())?;
    let text = format!("[Immagine {width}x{height}]");
    let (row, _) = db
        .lock()
        .map_err(|e| e.to_string())?
        .insert_text(
            "image",
            &text,
            source_app,
            window_title,
            &hash,
            false,
            None,
            Some(path.to_string_lossy().as_ref()),
        )
        .map_err(|e| e.to_string())?;
    *last_hash = hash;
    Ok(row)
}

fn ingest_snapshot(
    db: &Arc<Mutex<Db>>,
    snapshot: &Snapshot,
    source: &(String, String),
    last_hash: &mut String,
    dir: &Path,
) -> Result<Option<ClipRow>, String> {
    if snapshot.hash() == *last_hash {
        return Ok(None);
    }
    match snapshot {
        Snapshot::Image(img) => ingest_image(db, img, &source.0, &source.1, last_hash, dir),
        Snapshot::Text(text) => ingest_text(db, text, &source.0, &source.1, last_hash),
    }
    .map(Some)
}

fn ignored(app: &str, settings: &crate::WatchSettings) -> bool {
    let app = app.to_lowercase();
    settings.ignored_apps.iter().any(|name| {
        let name = name.trim().to_lowercase();
        !name.is_empty() && app.contains(&name)
    })
}

// Both automatic and manual capture use the same path, on a background thread.
fn capture(app: &tauri::AppHandle, cb: &mut Clipboard, automatic: bool) -> Result<(), String> {
    let state = app.state::<crate::AppState>();
    let settings = state.watch.lock().map_err(|e| e.to_string())?.clone();
    if automatic && !settings.auto_capture {
        return Ok(());
    }
    // Take the source before decoding images/OCR; use this same snapshot for the
    // ignored-app check and the saved metadata.
    let source = crate::source::active_app();
    let _clipboard_guard = state.clipboard_gate.lock().map_err(|e| e.to_string())?;
    let Some(snapshot) = read_snapshot(cb)? else {
        return Ok(());
    };
    let mut last_hash = state.last_hash.lock().map_err(|e| e.to_string())?;
    if ignored(&source.0, &settings) {
        *last_hash = snapshot.hash();
        return Ok(());
    }
    let row = ingest_snapshot(&state.db, &snapshot, &source, &mut last_hash, &images_dir())?;
    drop(last_hash);
    drop(_clipboard_guard);
    if let Some(row) = row {
        crate::notify_new_clip(app);
        queue_ocr(app, row);
    }
    Ok(())
}

pub fn capture_now(app: &tauri::AppHandle) -> Result<(), String> {
    let mut cb = Clipboard::new().map_err(|e| e.to_string())?;
    capture(app, &mut cb, false)
}

fn queue_ocr(app: &tauri::AppHandle, row: ClipRow) {
    if row.kind != "image" || row.ocr_text.is_some() {
        return;
    }
    // OCR is optional and never holds the clipboard or hash locks. A bounded
    // queue keeps rapid screenshots from spawning unlimited tesseract processes.
    static OCR: OnceLock<mpsc::SyncSender<(tauri::AppHandle, ClipRow)>> = OnceLock::new();
    let tx = OCR.get_or_init(|| {
        let (tx, rx) = mpsc::sync_channel::<(tauri::AppHandle, ClipRow)>(8);
        std::thread::spawn(move || {
            for (app, row) in rx {
                let Some(path) = row.image_path else { continue };
                if let Ok(text) = crate::tesseract(Path::new(&path)) {
                    if !text.is_empty() {
                        let state = app.state::<crate::AppState>();
                        if let Ok(db) = state.db.lock() {
                            if db.set_ocr(&row.id, &text).is_ok() {
                                use tauri::Emitter;
                                let _ = app.emit("clips-changed", ());
                            }
                        };
                    }
                }
            }
        });
        tx
    });
    let _ = tx.try_send((app.clone(), row));
}

pub fn run_loop(app: tauri::AppHandle) {
    let mut clipboard = Clipboard::new().ok();
    loop {
        std::thread::sleep(Duration::from_millis(500));
        if clipboard.is_none() {
            clipboard = Clipboard::new().ok();
        }
        if let Some(cb) = clipboard.as_mut() {
            // A failed read/write leaves last_hash intact and is retried. In
            // particular, no poll is blindly skipped after Boardify copies.
            let _ = capture(&app, cb, true);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture {
        db: Arc<Mutex<Db>>,
        dir: std::path::PathBuf,
        hash: String,
    }
    impl Fixture {
        fn new() -> Self {
            Self {
                db: Arc::new(Mutex::new(Db::in_memory().unwrap())),
                dir: std::env::temp_dir()
                    .join(format!("boardify-image-test-{}", uuid::Uuid::new_v4())),
                hash: String::new(),
            }
        }
        fn ingest(&mut self, snap: &Snapshot) -> Result<Option<ClipRow>, String> {
            ingest_snapshot(
                &self.db,
                snap,
                &("google-chrome".into(), "Fixture".into()),
                &mut self.hash,
                &self.dir,
            )
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }
    fn image(w: usize, h: usize) -> Snapshot {
        Snapshot::Image(ImageData {
            width: w,
            height: h,
            bytes: vec![127; w * h * 4].into(),
        })
    }
    struct BrowserClipboard {
        image: Option<ImageData<'static>>,
        text_reads: usize,
        broken_image: bool,
    }
    impl ClipboardReader for BrowserClipboard {
        fn image(&mut self) -> Result<ImageData<'static>, arboard::Error> {
            if self.broken_image {
                return Err(arboard::Error::ConversionFailure);
            }
            self.image
                .clone()
                .ok_or(arboard::Error::ContentNotAvailable)
        }
        fn files(&mut self) -> Result<Vec<std::path::PathBuf>, arboard::Error> {
            Err(arboard::Error::ContentNotAvailable)
        }
        fn text(&mut self) -> Result<String, arboard::Error> {
            self.text_reads += 1;
            Ok("https://example.test/image.png".into())
        }
    }
    #[test]
    fn browser_image_with_url_never_turns_into_a_link_even_on_duplicate_poll() {
        let Snapshot::Image(img) = image(48, 32) else {
            unreachable!()
        };
        let mut browser = BrowserClipboard {
            image: Some(img),
            text_reads: 0,
            broken_image: false,
        };
        let mut f = Fixture::new();
        assert_eq!(
            f.ingest(&read_from(&mut browser).unwrap().unwrap())
                .unwrap()
                .unwrap()
                .kind,
            "image"
        );
        assert!(f
            .ingest(&read_from(&mut browser).unwrap().unwrap())
            .unwrap()
            .is_none());
        assert_eq!(browser.text_reads, 0);
    }
    #[test]
    fn unreadable_image_retries_instead_of_importing_companion_url() {
        let mut browser = BrowserClipboard {
            image: None,
            text_reads: 0,
            broken_image: true,
        };
        assert!(read_from(&mut browser).is_err());
        assert_eq!(browser.text_reads, 0);
        browser.broken_image = false;
        assert!(matches!(
            read_from(&mut browser).unwrap(),
            Some(Snapshot::Text(_))
        ));
    }
    #[test]
    fn image_is_saved_on_first_capture_and_deduplicated() {
        let mut f = Fixture::new();
        let snap = image(64, 48);
        let row = f.ingest(&snap).unwrap().unwrap();
        assert_eq!(row.kind, "image");
        assert_eq!(row.source_app, "google-chrome");
        let saved = image::open(row.image_path.unwrap()).unwrap();
        assert_eq!((saved.width(), saved.height()), (64, 48));
        assert!(f.ingest(&snap).unwrap().is_none());
        assert_eq!(std::fs::read_dir(&f.dir).unwrap().count(), 1);
        assert_eq!(
            f.db.lock()
                .unwrap()
                .list(20, None, None, false)
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn screenshots_without_companion_text_are_captured_consecutively() {
        let mut f = Fixture::new();
        assert!(f.ingest(&image(40, 50)).unwrap().is_some());
        assert!(f.ingest(&image(50, 40)).unwrap().is_some());
        assert_eq!(
            f.db.lock()
                .unwrap()
                .list(20, None, None, false)
                .unwrap()
                .len(),
            2
        );
    }
    #[test]
    fn failed_save_does_not_consume_image_and_can_retry() {
        let mut f = Fixture::new();
        std::fs::write(&f.dir, b"not a directory").unwrap();
        let snap = image(8, 8);
        assert!(f.ingest(&snap).is_err());
        assert!(f.hash.is_empty());
        std::fs::remove_file(&f.dir).unwrap();
        assert!(f.ingest(&snap).unwrap().is_some());
    }
    #[test]
    fn tiny_images_and_alpha_are_preserved() {
        let mut f = Fixture::new();
        let snap = Snapshot::Image(ImageData {
            width: 1,
            height: 1,
            bytes: vec![255, 0, 0, 64].into(),
        });
        let row = f.ingest(&snap).unwrap().unwrap();
        assert_eq!(
            image::open(row.image_path.unwrap())
                .unwrap()
                .to_rgba8()
                .into_raw(),
            [255, 0, 0, 64]
        );
    }
    #[test]
    fn invalid_image_never_advances_hash() {
        let mut f = Fixture::new();
        let snap = Snapshot::Image(ImageData {
            width: 64,
            height: 64,
            bytes: vec![0; 16].into(),
        });
        assert!(f.ingest(&snap).is_err());
        assert!(f.hash.is_empty());
    }
    #[test]
    fn file_manager_single_image_is_decoded_but_multiple_files_are_not_collapsed() {
        let mut f = Fixture::new();
        let row = f.ingest(&image(12, 20)).unwrap().unwrap();
        let paths = vec![std::path::PathBuf::from(row.image_path.unwrap())];
        let decoded = single_image_file(&paths).unwrap().unwrap();
        assert_eq!((decoded.width, decoded.height), (12, 20));
        assert!(single_image_file(&[paths[0].clone(), paths[0].clone()]).is_none());
    }
}
