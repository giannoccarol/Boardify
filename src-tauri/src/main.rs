//! Boardify — backend Rust: clipboard watcher, SQLite FTS, comandi Tauri.
//! Local-first, privacy-first. Nessun network.

mod clipboard;
mod db;
mod detect;
mod icons;
mod paste;
#[cfg(target_os = "windows")]
mod screen;
mod source;
mod shelf_transition;
mod watcher;

use chrono::Utc;
use db::{Category, ClipRow, Db, Space};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, PhysicalPosition, PhysicalSize, State, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub struct AppState {
    pub db: Arc<Mutex<Db>>,
    pub last_hash: Arc<Mutex<String>>,
    pub clipboard_gate: Mutex<()>,
    pub watch: Arc<Mutex<WatchSettings>>,
    pub seq: Arc<Mutex<usize>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchSettings {
    pub auto_capture: bool,
    pub capture_toast: bool,
    pub ignored_apps: Vec<String>,
    pub auto_delete_days: i64,
    pub shortcuts_enabled: bool,
    pub notch_enabled: bool,
    pub shelf_shortcut: String,
    pub auto_paste: bool,
    pub max_items: i64,
}

impl Default for WatchSettings {
    fn default() -> Self {
        Self {
            auto_capture: true,
            // Popup di cattura disabilitato su richiesta: resta il codice per
            // riattivarlo, ma il default è off e c'è un master switch in
            // notify_new_clip/show_capture_toast che lo blocca comunque.
            capture_toast: false,
            ignored_apps: vec![],
            auto_delete_days: 0,
            shortcuts_enabled: true,
            notch_enabled: true,
            shelf_shortcut: "Ctrl+Super+A".into(),
            // Deroga AGENTS.md: iniezione tasti solo su scelta esplicita.
            auto_paste: false,
            max_items: 0,
        }
    }
}

// ── Tipi pubblici ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Clip {
    pub id: String,
    pub kind: String, // text | link | code | color | image | file
    pub text: Option<String>,
    pub preview: String,
    pub image_path: Option<String>,
    pub color_hex: Option<String>,
    pub file_paths: Option<Vec<String>>,
    pub source_app: String,
    pub source_icon: Option<String>,
    pub window_title: String,
    pub hash: String,
    pub is_favorite: bool,
    pub is_sensitive: bool,
    pub ocr_text: Option<String>,
    pub copy_count: i64,
    pub categories: Vec<String>,
    pub created_at: String,
    pub is_pinned: bool,
    pub inline_shortcut: Option<String>,
    #[serde(default)]
    pub remind_at: Option<String>,
}

impl From<ClipRow> for Clip {
    fn from(r: ClipRow) -> Self {
        let preview = preview_of(&r.kind, r.text.as_deref(), r.color_hex.as_deref());
        Self {
            id: r.id,
            kind: r.kind,
            text: r.text,
            preview,
            image_path: r.image_path,
            color_hex: r.color_hex,
            file_paths: r
                .file_paths_json
                .and_then(|s| serde_json::from_str(&s).ok()),
            source_app: r.source_app.clone(),
            source_icon: crate::icons::resolve_data_url(&r.source_app),
            window_title: r.window_title,
            hash: r.hash,
            is_favorite: r.is_favorite,
            is_sensitive: r.is_sensitive,
            ocr_text: r.ocr_text,
            copy_count: r.copy_count,
            categories: r
                .categories_json
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default(),
            created_at: r.created_at,
            is_pinned: r.is_pinned,
            inline_shortcut: r.inline_shortcut,
            remind_at: r.remind_at,
        }
    }
}

fn preview_of(kind: &str, text: Option<&str>, color: Option<&str>) -> String {
    if kind == "color" {
        return color.unwrap_or("#000000").to_string();
    }
    text.unwrap_or("").chars().take(220).collect()
}

// ── Comandi ────────────────────────────────────────────────────

#[tauri::command]
fn get_clips(
    state: State<AppState>,
    limit: Option<i64>,
    kind: Option<String>,
    category: Option<String>,
    favorites_only: Option<bool>,
) -> Result<Vec<Clip>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list(limit.unwrap_or(100), kind.as_deref(), category.as_deref(), favorites_only.unwrap_or(false))
        .map(|rows| rows.into_iter().map(Clip::from).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn search_clips(state: State<AppState>, query: String, limit: Option<i64>) -> Result<Vec<Clip>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.search(&query, limit.unwrap_or(100))
        .map(|rows| rows.into_iter().map(Clip::from).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_favorite(state: State<AppState>, id: String) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.toggle_favorite(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_clip(state: State<AppState>, app: tauri::AppHandle, id: String) -> Result<(), String> {
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.delete(&id).map_err(|e| e.to_string())?;
    }
    let _ = app.emit("clips-changed", ());
    let _ = app.emit("reminders-changed", ());
    Ok(())
}

/// Export JSON v1 negli appunti-nostrani: ritorna il JSON, il frontend decide dove metterlo.
#[tauri::command]
fn export_clips(state: State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.export_json().map_err(|e| e.to_string())
}

#[tauri::command]
fn import_clips(state: State<AppState>, app: tauri::AppHandle, json: String) -> Result<serde_json::Value, String> {
    let (imported, skipped) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.import_json(&json).map_err(|e| e.to_string())?
    };
    let _ = app.emit("clips-changed", ());
    Ok(serde_json::json!({ "imported": imported, "skipped": skipped }))
}

/// Backup coerente (DB cifrato + immagini) in data_dir/backups, ritorna il percorso.
#[tauri::command]
fn backup_now(state: State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.backup_now()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_history(state: State<AppState>, app: tauri::AppHandle) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.clear().map_err(|e| e.to_string())?;
    let _ = app.emit("clips-changed", ());
    let _ = app.emit("reminders-changed", ());
    Ok(())
}

/// Data URL dell'immagine di un clip: la webview non carica sempre i file locali
/// (asset://), il data: funziona ovunque. Solo dentro images_dir().
#[tauri::command]
fn image_data(state: State<AppState>, id: String) -> Result<String, String> {
    let row = state.db.lock().map_err(|e| e.to_string())?
        .get(&id).map_err(|e| e.to_string())?.ok_or("clip non trovata")?;
    let path = row.image_path.as_deref().ok_or("nessuna immagine")?;
    let canon = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
    let dir = std::fs::canonicalize(db::images_dir()).map_err(|e| e.to_string())?;
    if !canon.starts_with(&dir) {
        return Err("percorso non consentito".into());
    }
    let bytes = std::fs::read(&canon).map_err(|e| e.to_string())?;
    use base64::Engine;
    Ok(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

fn write_clip(app: &tauri::AppHandle, row: &ClipRow) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let content = clipboard::content(row)?;
    let state = app.state::<AppState>();
    // Sezione critica cortissima: solo la scrittura negli appunti + update
    // dell'hash. Il bump DB avviene dopo aver rilasciato i lock così il
    // watcher non blocca mai il copia/incolla dell'utente e viceversa.
    {
        let _gate = state.clipboard_gate.lock().map_err(|e| e.to_string())?;
        let mut last_hash = state.last_hash.lock().map_err(|e| e.to_string())?;
        match &content {
            watcher::Snapshot::Image(img) => {
                let image = tauri::image::Image::new(img.bytes.as_ref(), img.width as u32, img.height as u32);
                app.clipboard().write_image(&image).map_err(|e| e.to_string())?;
            }
            watcher::Snapshot::Text(text) => app.clipboard().write_text(text.clone()).map_err(|e| e.to_string())?,
            watcher::Snapshot::Files(paths) => {
                // text/uri-list su Linux, CF_HDROP su Windows — via arboard su entrambi.
                let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
                cb.set()
                    .file_list(paths)
                    .map_err(|e| format!("Copia file non riuscita: {e}"))?;
            }
        }
        // Suppress exactly our successful write, never the user's next clipboard.
        *last_hash = content.hash();
    }
    state.db.lock().map_err(|e| e.to_string())?.bump_copy(&row.id).map_err(|e| e.to_string())?;
    let _ = app.emit("clips-changed", ());
    Ok(())
}

#[tauri::command]
async fn copy_clip(app: tauri::AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || {
            let row = app.state::<AppState>().db.lock().map_err(|e| e.to_string())?
                .get(&id).map_err(|e| e.to_string())?.ok_or("clip non trovata")?;
            write_clip(&app, &row)
        }
    }).await.map_err(|e| e.to_string())??;
    // Auto-paste opt-in: nascondi la UI, poi Ctrl+V sintetico in un thread a parte
    // così la risposta del comando non aspetta i 180ms di focus.
    let auto = app.state::<AppState>().watch.lock().map(|w| w.auto_paste).unwrap_or(false);
    if auto {
        hide_labeled(&app, "shelf");
        hide_labeled(&app, "library");
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(180));
            if let Err(e) = crate::paste::paste_ctrl_v() {
                let _ = app.emit("paste-failed", e);
            }
        });
    }
    Ok(())
}

/// Scrive testo arbitrario (es. formati "Copia come") senza creare clip:
/// sotto gate + last_hash aggiornato così il watcher non lo re-ingerisce.
/// Niente bump_copy, niente emit: la history non cambia.
#[tauri::command]
fn copy_text(state: State<AppState>, app: tauri::AppHandle, text: String) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let _gate = state.clipboard_gate.lock().map_err(|e| e.to_string())?;
    app.clipboard().write_text(text.clone()).map_err(|e| e.to_string())?;
    let mut last_hash = state.last_hash.lock().map_err(|e| e.to_string())?;
    *last_hash = watcher::Snapshot::Text(text).hash();
    Ok(())
}

#[tauri::command]
fn combine_clips(state: State<AppState>, app: tauri::AppHandle, ids: Vec<String>) -> Result<Clip, String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut parts = Vec::new();
    for id in &ids {
        if let Some(row) = db.get(id).map_err(|e| e.to_string())? {
            if let Some(t) = row.text {
                parts.push(t);
            }
        }
    }
    drop(db);
    let combined = parts.join("\n\n— — —\n\n");
    // Scrittura negli appunti sotto gate, ingest dopo: non tenere il gate
    // bloccato durante SQLite così un copia rapido + Ctrl+V non si incastra.
    {
        let _gate = state.clipboard_gate.lock().map_err(|e| e.to_string())?;
        app.clipboard().write_text(combined.clone()).map_err(|e| e.to_string())?;
    }
    let mut last_hash = state.last_hash.lock().map_err(|e| e.to_string())?;
    let clip = watcher::ingest_text(
        &state.db,
        &combined,
        "Boardify · Multi-clip",
        "Multi-clip Copy",
        &mut last_hash,
    )
    .map_err(|e| e.to_string())?;
    let _ = app.emit("clips-changed", ());
    Ok(clip.into())
}

#[tauri::command]
fn get_categories(state: State<AppState>) -> Result<Vec<Category>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.categories().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_category(state: State<AppState>, app: tauri::AppHandle, name: String, color: Option<String>) -> Result<Category, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let c = db.create_category(&name, color.as_deref()).map_err(|e| e.to_string())?;
    let _ = app.emit("categories-changed", ());
    Ok(c)
}

#[tauri::command]
fn assign_category(state: State<AppState>, app: tauri::AppHandle, clip_id: String, category_id: String, assign: bool) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.assign_category(&clip_id, &category_id, assign).map_err(|e| e.to_string())?;
    let _ = app.emit("clips-changed", ());
    Ok(())
}

#[tauri::command]
fn get_stats(state: State<AppState>) -> Result<serde_json::Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.stats().map_err(|e| e.to_string())
}

// ── Spaces: manuali (clip_spaces) + smart (query_json) ──

#[tauri::command]
fn get_spaces(state: State<AppState>) -> Result<Vec<Space>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_spaces().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_space(
    state: State<AppState>,
    app: tauri::AppHandle,
    name: String,
    icon: Option<String>,
    query_json: Option<String>,
    is_smart: Option<bool>,
) -> Result<Space, String> {
    let s = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.create_space(&name, icon.as_deref(), query_json.as_deref(), is_smart.unwrap_or(false))
            .map_err(|e| e.to_string())?
    };
    let _ = app.emit("spaces-changed", ());
    Ok(s)
}

#[tauri::command]
fn delete_space(state: State<AppState>, app: tauri::AppHandle, id: String) -> Result<(), String> {
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.delete_space(&id).map_err(|e| e.to_string())?;
    }
    let _ = app.emit("spaces-changed", ());
    Ok(())
}

#[tauri::command]
fn assign_space(state: State<AppState>, app: tauri::AppHandle, clip_id: String, space_id: String, assign: bool) -> Result<(), String> {
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.assign_space(&clip_id, &space_id, assign).map_err(|e| e.to_string())?;
    }
    let _ = app.emit("spaces-changed", ());
    let _ = app.emit("clips-changed", ());
    Ok(())
}

#[tauri::command]
fn get_space_clips(state: State<AppState>, space_id: String, limit: Option<i64>) -> Result<Vec<Clip>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.space_clips(&space_id, limit.unwrap_or(100))
        .map(|rows| rows.into_iter().map(Clip::from).collect())
        .map_err(|e| e.to_string())
}

/// Proxy HTTP per le API AI: la webview applica il CORS e alcuni provider
/// (o Ollama senza OLLAMA_ORIGINS) rifiutano le chiamate browser. Rust no.
/// Solo https, oppure http verso localhost (Ollama). Timeout limitato.
#[tauri::command]
async fn ai_proxy(
    url: String,
    headers: std::collections::HashMap<String, String>,
    body: Option<serde_json::Value>,
    timeout_ms: u64,
) -> Result<serde_json::Value, String> {
    let http_local =
        url.starts_with("http://localhost") || url.starts_with("http://127.0.0.1");
    if !(url.starts_with("https://") || http_local) {
        return Err("URL non valido: solo https o localhost".into());
    }
    let client = reqwest::Client::builder()
        .user_agent("Boardify/0.1.0")
        .timeout(Duration::from_millis(timeout_ms.clamp(1_000, 120_000)))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = if let Some(b) = &body {
        client.post(&url).json(b)
    } else {
        client.get(&url)
    };
    for (k, v) in &headers {
        req = req.header(k, v);
    }
    let res = req.send().await.map_err(|e| format!("Rete: {e}"))?;
    let status = res.status();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status.as_u16(), ai_error_detail(&text)));
    }
    if text.trim().is_empty() {
        return Ok(serde_json::Value::Null);
    }
    serde_json::from_str(&text).map_err(|e| format!("Risposta non JSON: {e}"))
}

fn ai_error_detail(text: &str) -> String {
    if let Ok(j) = serde_json::from_str::<serde_json::Value>(text) {
        if let Some(m) = j
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
        {
            return m.chars().take(300).collect();
        }
        if let Some(m) = j.get("message").and_then(|m| m.as_str()) {
            return m.chars().take(300).collect();
        }
    }
    text.chars().take(300).collect()
}

// ── Finestre: toggle shelf/library ─────────────────────────────

static CAPTURE_GEN: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy)]
struct MonitorBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn monitor_index_at_point(bounds: &[MonitorBounds], point: PhysicalPosition<f64>) -> Option<usize> {
    bounds.iter().position(|monitor| {
        let left = f64::from(monitor.x);
        let top = f64::from(monitor.y);
        point.x >= left
            && point.x < left + f64::from(monitor.width)
            && point.y >= top
            && point.y < top + f64::from(monitor.height)
    })
}

pub(crate) fn is_wayland_session() -> bool {
    cfg!(target_os = "linux")
        && (std::env::var_os("WAYLAND_DISPLAY").is_some()
            || std::env::var("XDG_SESSION_TYPE")
                .map(|value| value.eq_ignore_ascii_case("wayland"))
                .unwrap_or(false))
}

fn monitor_index_by_name(names: &[Option<&str>], target: &str) -> Option<usize> {
    names.iter().position(|name| {
        name.is_some_and(|name| name.trim().eq_ignore_ascii_case(target.trim()))
    })
}

#[cfg(target_os = "linux")]
fn wayland_active_output_name() -> Option<String> {
    let desktop = std::env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .to_uppercase();
    if !(desktop.contains("KDE") || desktop.contains("PLASMA")) {
        return None;
    }
    // KWin espone direttamente l'output attivo. Timeout corto: l'apertura della
    // shelf non deve mai restare appesa se D-Bus o il compositor non rispondono.
    let connection = zbus::blocking::connection::Builder::session()
        .ok()?
        .method_timeout(Duration::from_millis(80))
        .build()
        .ok()?;
    let proxy = zbus::blocking::Proxy::new(
        &connection,
        "org.kde.KWin",
        "/KWin",
        "org.kde.KWin",
    )
    .ok()?;
    let name: String = proxy.call("activeOutputName", &()).ok()?;
    (!name.trim().is_empty()).then_some(name)
}

#[cfg(not(target_os = "linux"))]
fn wayland_active_output_name() -> Option<String> {
    None
}

fn target_monitor(w: &tauri::WebviewWindow) -> Option<tauri::Monitor> {
    let monitors = w.available_monitors().ok().unwrap_or_default();
    // Su X11 e Windows le coordinate sono globali e fisiche, come position/size
    // dei monitor. Tao su Wayland restituisce invece (0, 0) perché il protocollo
    // non espone la posizione globale del puntatore: in quel caso usare quel dato
    // sceglierebbe quasi sempre il monitor sbagliato.
    if is_wayland_session() {
        if let Some(output) = wayland_active_output_name() {
            let names: Vec<_> = monitors
                .iter()
                .map(|monitor| monitor.name().map(String::as_str))
                .collect();
            if let Some(index) = monitor_index_by_name(&names, &output) {
                return monitors.get(index).cloned();
            }
        }
    } else {
        if let Ok(cursor) = w.cursor_position() {
            let bounds: Vec<_> = monitors
                .iter()
                .map(|monitor| MonitorBounds {
                    x: monitor.position().x,
                    y: monitor.position().y,
                    width: monitor.size().width,
                    height: monitor.size().height,
                })
                .collect();
            if let Some(index) = monitor_index_at_point(&bounds, cursor) {
                return monitors.get(index).cloned();
            }
        }
    }
    w.current_monitor()
        .ok()
        .flatten()
        .or_else(|| w.primary_monitor().ok().flatten())
        .or_else(|| monitors.into_iter().next())
}

#[cfg(test)]
mod monitor_placement_tests {
    use super::{monitor_index_at_point, monitor_index_by_name, MonitorBounds, PhysicalPosition};

    #[test]
    fn selects_monitor_containing_cursor_with_mixed_layout() {
        let monitors = [
            MonitorBounds {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
            },
            MonitorBounds {
                x: 1920,
                y: -240,
                width: 2560,
                height: 1440,
            },
            MonitorBounds {
                x: -1280,
                y: 120,
                width: 1280,
                height: 1024,
            },
        ];
        assert_eq!(
            monitor_index_at_point(&monitors, PhysicalPosition::new(3000.0, -100.0)),
            Some(1)
        );
        assert_eq!(
            monitor_index_at_point(&monitors, PhysicalPosition::new(-640.0, 600.0)),
            Some(2)
        );
        assert_eq!(
            monitor_index_at_point(&monitors, PhysicalPosition::new(960.0, 540.0)),
            Some(0)
        );
    }

    #[test]
    fn uses_half_open_edges_and_rejects_points_outside_desktop() {
        let monitors = [
            MonitorBounds {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
            },
            MonitorBounds {
                x: 1920,
                y: 0,
                width: 1920,
                height: 1080,
            },
        ];
        assert_eq!(
            monitor_index_at_point(&monitors, PhysicalPosition::new(1920.0, 500.0)),
            Some(1)
        );
        assert_eq!(
            monitor_index_at_point(&monitors, PhysicalPosition::new(3840.0, 500.0)),
            None
        );
    }

    #[test]
    fn matches_kwin_output_name_without_case_or_whitespace_noise() {
        let names = [Some("eDP-1"), Some("DP-6"), Some("DP-7")];
        assert_eq!(monitor_index_by_name(&names, " dp-6\n"), Some(1));
        assert_eq!(monitor_index_by_name(&names, "HDMI-A-1"), None);
    }
}

fn fill_monitor(w: &tauri::WebviewWindow) {
    // La shelf segue il puntatore a ogni apertura. current_monitor() da sola
    // conserva spesso il monitor della precedente apertura quando la finestra
    // è nascosta. Non chiamare center() dopo la posizione esplicita: su setup
    // con coordinate negative o DPI diversi può riportarla sul primario.
    let Some(monitor) = target_monitor(w) else {
        return;
    };
    let screen = monitor.size();
    let mon = monitor.position();
    let _ = w.set_position(PhysicalPosition::new(mon.x, mon.y));
    // La posizione prima della misura fa applicare a Windows il DPI del monitor
    // destinazione; la seconda chiamata in show_labeled stabilizza il resize
    // dopo che il toplevel è tornato visibile.
    let _ = w.set_size(PhysicalSize::new(screen.width, screen.height));
}

static SHELF_TRANSITION: Mutex<shelf_transition::ShelfTransition> =
    Mutex::new(shelf_transition::ShelfTransition::new());

fn show_labeled(app: &tauri::AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        match label {
            "shelf" => {
                SHELF_TRANSITION.lock().unwrap_or_else(|e| e.into_inner()).show();
                if let Some(c) = app.get_webview_window("capture") {
                    let _ = c.hide();
                }
                fill_monitor(&w);
                let _ = w.set_ignore_cursor_events(false);
                let _ = w.show();
                fill_monitor(&w);
                let _ = w.set_focus();
            }
            "capture" => {
                place_capture(&w);
                let _ = w.show();
            }
            _ => {
                let _ = w.center();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        let _ = w.emit("window-shown", ());
    }
}

fn hide_labeled(app: &tauri::AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        if label == "shelf" && w.is_visible().unwrap_or(false) {
            let generation = SHELF_TRANSITION.lock()
                .unwrap_or_else(|e| e.into_inner()).request_close();
            let Some(generation) = generation else { return; };
            let _ = w.emit("shelf-close-requested", generation);
            // La UI conferma alla fine dell'exit. Fallback per WebView non pronta
            // o bloccata; il token evita di nascondere una successiva riapertura.
            let app = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(1200));
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || finish_shelf_close(handle, generation));
            });
            return;
        }
        let _ = w.hide();
    }
}

#[tauri::command]
fn finish_shelf_close(app: tauri::AppHandle, generation: u32) {
    let mut transition = SHELF_TRANSITION.lock().unwrap_or_else(|e| e.into_inner());
    if transition.finish_close(generation) {
        if let Some(w) = app.get_webview_window("shelf") { let _ = w.hide(); }
    }
}

fn toggle_window(app: &tauri::AppHandle, label: &str) {
    if label == "shelf" && SHELF_TRANSITION.lock()
        .unwrap_or_else(|e| e.into_inner()).is_closing() {
        show_labeled(app, label);
        return;
    }
    if let Some(w) = app.get_webview_window(label) {
        match w.is_visible() {
            Ok(true) => {
                hide_labeled(app, label);
            }
            _ => show_labeled(app, label),
        }
    }
}

/// Master switch del popup di cattura: disabilitato su richiesta utente.
/// NON rimuovere il codice del toast (place_capture/show_capture_toast e la
/// finestra "capture"): per riattivarlo basta rimettere `true` qui.
const CAPTURE_TOAST_ENABLED: bool = false;

pub(crate) fn notify_new_clip(app: &tauri::AppHandle) {
    let _ = app.emit("clips-changed", ());
    if !CAPTURE_TOAST_ENABLED {
        return;
    }
    let toast = app
        .state::<AppState>()
        .watch
        .lock()
        .map(|w| w.capture_toast)
        .unwrap_or(false);
    if toast {
        show_capture_toast(app);
    }
}

/// Finestrella toast top-center a misura di pill (480x80 da tauri.conf):
/// niente fullscreen e niente click-through — set_ignore_cursor_events(true)
/// su finestra non ancora realizzata fa panic dentro tao su Wayland.
fn place_capture(w: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = w.current_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    let size = monitor.size().to_logical::<f64>(scale);
    let pos = monitor.position().to_logical::<f64>(scale);
    let x = pos.x + (size.width - 480.0) / 2.0;
    let _ = w.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y: pos.y + 10.0 }));
}

fn show_capture_toast(app: &tauri::AppHandle) {
    // Doppia guardia: anche le chiamate dirette non devono mai mostrare il
    // popup mentre il master switch è off. Mostrare la finestra ruba il focus
    // su Wayland e rompe il flusso copia -> Ctrl+V.
    if !CAPTURE_TOAST_ENABLED {
        return;
    }
    if let Some(shelf) = app.get_webview_window("shelf") {
        if shelf.is_visible().unwrap_or(false) {
            return;
        }
    }
    if let Some(w) = app.get_webview_window("capture") {
        place_capture(&w);
        let already = w.is_visible().unwrap_or(false);
        if !already {
            let _ = w.show();
            let _ = w.emit("window-shown", ());
        }
    }
    let gen = CAPTURE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(2800));
        if CAPTURE_GEN.load(Ordering::SeqCst) == gen {
            hide_labeled(&app, "capture");
        }
    });
}

#[tauri::command]
fn show_window(app: tauri::AppHandle, label: String) {
    show_labeled(&app, &label);
}

#[tauri::command]
fn hide_window(app: tauri::AppHandle, label: String) {
    hide_labeled(&app, &label);
}

#[tauri::command]
fn toggle_pin(state: State<AppState>, id: String) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.toggle_pin(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_reminders(state: State<AppState>) -> Result<Vec<Clip>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_reminders()
        .map(|rows| rows.into_iter().map(Clip::from).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_reminder(state: State<AppState>, app: tauri::AppHandle, clip_id: String, remind_at: String) -> Result<Clip, String> {
    let row = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.set_reminder(&clip_id, &remind_at).map_err(|e| e.to_string())?
    };
    let _ = app.emit("reminders-changed", ());
    let _ = app.emit("clips-changed", ());
    Ok(row.into())
}

#[tauri::command]
fn clear_reminder(state: State<AppState>, app: tauri::AppHandle, clip_id: String) -> Result<(), String> {
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.clear_reminder(&clip_id).map_err(|e| e.to_string())?;
    }
    let _ = app.emit("reminders-changed", ());
    let _ = app.emit("clips-changed", ());
    Ok(())
}

#[tauri::command]
fn snooze_reminder(state: State<AppState>, app: tauri::AppHandle, clip_id: String, minutes: Option<i64>) -> Result<Clip, String> {
    let row = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.snooze_reminder(&clip_id, minutes.unwrap_or(30)).map_err(|e| e.to_string())?
    };
    let _ = app.emit("reminders-changed", ());
    let _ = app.emit("clips-changed", ());
    Ok(row.into())
}

/// Loop reminder: ogni 15s cerca gli scaduti, manda la notifica OS una volta
/// sola e avvisa la UI. Niente focus rubato, niente paste-injection:
/// l'utente riapre la shelf e copia con Ctrl+V come sempre.
fn run_reminder_loop(app: tauri::AppHandle) {
    use tauri_plugin_notification::NotificationExt;
    loop {
        std::thread::sleep(Duration::from_secs(15));
        let due: Vec<Clip> = app
            .state::<AppState>()
            .db
            .lock()
            .ok()
            .and_then(|db| db.due_reminders(&Utc::now().to_rfc3339()).ok())
            .unwrap_or_default()
            .into_iter()
            .map(Clip::from)
            .collect();
        for clip in due {
            let body: String = clip
                .text
                .as_deref()
                .unwrap_or(clip.preview.as_str())
                .chars()
                .take(140)
                .collect();
            let _ = app
                .notification()
                .builder()
                .title("Boardify · Promemoria")
                .body(body.trim())
                .show();
            if let Ok(db) = app.state::<AppState>().db.lock() {
                let _ = db.mark_notified(&clip.id);
            }
            let _ = app.emit("reminder-due", &clip);
            let _ = app.emit("reminders-changed", ());
            let _ = app.emit("clips-changed", ());
        }
    }
}

#[tauri::command]
fn set_inline_shortcut(state: State<AppState>, id: String, shortcut: Option<String>) -> Result<(), String> {
    let norm = shortcut
        .as_deref()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .map(|s| if s.starts_with(';') { s } else { format!(";{s}") });
    if let Some(ref s) = norm {
        if !s.chars().skip(1).all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            || s.len() < 3
            || s.len() > 25
        {
            return Err("scorciatoia non valida (usa ;nome, 2-24 caratteri)".into());
        }
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_inline_shortcut(&id, norm.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn edit_clip(state: State<AppState>, app: tauri::AppHandle, id: String, text: String) -> Result<Clip, String> {
    let row = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.update_text(&id, text.trim()).map_err(|e| e.to_string())?
    };
    let _ = app.emit("clips-changed", ());
    Ok(row.into())
}

fn ingest_clip(app: &tauri::AppHandle, text: &str, source: &str, title: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut hash = state.last_hash.lock().map_err(|e| e.to_string())?;
    watcher::ingest_text(&state.db, text, source, title, &mut hash)?;
    drop(hash);
    notify_new_clip(app);
    Ok(())
}

#[tauri::command]
fn insert_note(app: tauri::AppHandle, text: String) -> Result<(), String> {
    ingest_clip(&app, &text, "Boardify", "Quick note")
}

/// Registra la shortcut di apertura shelf (best-effort: su Wayland/X11 il
/// compositore può intercettarla; su Windows `Super` = tasto Win).
fn register_shelf_shortcut(app: &tauri::AppHandle, shortcut: &str) -> Result<(), String> {
    use std::str::FromStr;
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let sc = Shortcut::from_str(shortcut).map_err(|e| format!("shortcut non valida: {e}"))?;
    let _ = app.global_shortcut().on_shortcut(sc, |app, _s, ev| {
        if ev.state == ShortcutState::Pressed && shortcuts_on(app) {
            let ok = app
                .state::<AppState>()
                .watch
                .lock()
                .map(|w| w.notch_enabled)
                .unwrap_or(true);
            if ok {
                toggle_window(app, "shelf");
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn apply_watch_settings(
    state: State<AppState>,
    app: tauri::AppHandle,
    auto_capture: bool,
    capture_toast: bool,
    ignored_apps: Vec<String>,
    auto_delete_days: i64,
    shortcuts_enabled: bool,
    notch_enabled: bool,
    shelf_shortcut: String,
    auto_paste: bool,
    max_items: i64,
) -> Result<(), String> {
    use std::str::FromStr;
    // Valida prima di toccare lo stato: stringa malformata = errore al frontend.
    let new_sc = Shortcut::from_str(shelf_shortcut.trim()).map_err(|e| format!("shortcut non valida: {e}"))?;
    let old = {
        let mut w = state.watch.lock().map_err(|e| e.to_string())?;
        w.auto_capture = auto_capture;
        w.capture_toast = capture_toast;
        w.ignored_apps = ignored_apps;
        w.auto_delete_days = auto_delete_days;
        w.shortcuts_enabled = shortcuts_enabled;
        w.notch_enabled = notch_enabled;
        w.auto_paste = auto_paste;
        w.max_items = max_items;
        std::mem::replace(&mut w.shelf_shortcut, new_sc.to_string())
    };
    if old != new_sc.to_string() {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        let handle = app.global_shortcut();
        if let Ok(old_sc) = Shortcut::from_str(&old) {
            let _ = handle.unregister(old_sc);
        }
        register_shelf_shortcut(&app, &new_sc.to_string())?;
    }
    if auto_delete_days > 0 {
        if let Ok(db) = state.db.lock() {
            let _ = db.prune_unused(auto_delete_days);
        }
    }
    if max_items > 0 {
        if let Ok(db) = state.db.lock() {
            let _ = db.prune_by_count(max_items);
        }
    }
    Ok(())
}

#[tauri::command]
fn pick_color(app: tauri::AppHandle) -> Result<String, String> {
    let hex = run_color_picker()?;
    ingest_clip(&app, &hex, "Boardify", "Color picker")?;
    Ok(hex)
}

#[tauri::command]
fn capture_screen_text(app: tauri::AppHandle) -> Result<String, String> {
    let text = ocr_region()?;
    if text.trim().is_empty() {
        return Err("nessun testo riconosciuto".into());
    }
    ingest_clip(&app, text.trim(), "Boardify", "Screen text")?;
    Ok(text)
}

#[tauri::command]
async fn capture_now(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || watcher::capture_now(&app))
        .await.map_err(|e| e.to_string())?
}

fn shortcuts_on(app: &tauri::AppHandle) -> bool {
    app.state::<AppState>()
        .watch
        .lock()
        .map(|w| w.shortcuts_enabled)
        .unwrap_or(true)
}

#[cfg(target_os = "linux")]
fn run_color_picker() -> Result<String, String> {
    let tries: &[(&str, &[&str])] = &[
        ("hyprpicker", &["-n"]),
        ("kcolorchooser", &["--print"]),
        ("gpick", &["--pick", "--single", "--output"]),
    ];
    for (bin, args) in tries {
        if let Ok(out) = std::process::Command::new(bin).args(*args).output() {
            if out.status.success() {
                let s = String::from_utf8_lossy(&out.stdout).trim().to_uppercase();
                if s.starts_with('#') {
                    return Ok(s);
                }
            }
        }
    }
    Err("installa hyprpicker o kcolorchooser".into())
}

/// Windows: nessun picker esterno agganciato al momento.
/// Compila e degrada con messaggio chiaro invece di shell-out Linux.
#[cfg(target_os = "windows")]
fn run_color_picker() -> Result<String, String> {
    // Dialogo colore nativo (comdlg32): modale, con custom colors azzerati.
    use windows::Win32::Foundation::{COLORREF, HWND};
    use windows::Win32::UI::Controls::Dialogs::{
        ChooseColorW, CHOOSECOLORW, CC_FULLOPEN, CC_RGBINIT,
    };
    let mut custom = [COLORREF(0); 16];
    let mut cc = CHOOSECOLORW {
        lStructSize: size_of::<CHOOSECOLORW>() as u32,
        hwndOwner: HWND::default(),
        rgbResult: COLORREF(0),
        lpCustColors: custom.as_mut_ptr(),
        Flags: CC_FULLOPEN | CC_RGBINIT,
        ..Default::default()
    };
    let ok = unsafe { ChooseColorW(&mut cc) };
    if !ok.as_bool() {
        return Err("nessun colore selezionato".into());
    }
    // COLORREF = 0x00BBGGRR.
    let v = cc.rgbResult.0;
    Ok(format!(
        "#{:02X}{:02X}{:02X}",
        v & 0xFF,
        (v >> 8) & 0xFF,
        (v >> 16) & 0xFF
    ))
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn run_color_picker() -> Result<String, String> {
    Err("color picker non supportato su questa piattaforma".into())
}

#[cfg(target_os = "linux")]
fn ocr_region() -> Result<String, String> {
    let path = db::images_dir().join("screen-ocr.png");
    let grim = std::process::Command::new("sh")
        .arg("-c")
        .arg(format!(
            "geom=$(slurp) && grim -g \"$geom\" '{}'",
            path.display()
        ))
        .status();
    if grim.map(|s| s.success()).unwrap_or(false) {
        return tesseract(&path);
    }
    let spec = std::process::Command::new("spectacle")
        .args(["-b", "-n", "-r", "-o", path.to_str().unwrap_or("/tmp/boardify-ocr.png")])
        .status();
    if spec.map(|s| s.success()).unwrap_or(false) {
        return tesseract(&path);
    }
    Err("serve slurp+grim oppure spectacle, e tesseract".into())
}

/// Windows: cattura regione non ancora agganciata.
/// `tesseract` sotto resta cross-platform (se installato e nel PATH).
#[cfg(target_os = "windows")]
fn ocr_region() -> Result<String, String> {
    // GDI non offre selezione regione senza UI dedicata: catturiamo il monitor
    // primario intero e lasciamo a tesseract il resto. Serve `tesseract` nel PATH
    // (es. build UB Mannheim).
    let path = screen::capture_primary()?;
    tesseract(&path)
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn ocr_region() -> Result<String, String> {
    Err("cattura testo da schermo non supportata su questa piattaforma".into())
}

fn tesseract(path: &std::path::Path) -> Result<String, String> {
    let out = std::process::Command::new("tesseract")
        .args([path.as_os_str(), std::ffi::OsStr::new("stdout"), std::ffi::OsStr::new("-l"), std::ffi::OsStr::new("eng+ita")])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Incolla l'n-esimo clip recente (0-9) senza aprire UI.
fn paste_recent(app: &tauri::AppHandle, index: usize) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let rows = state.db.lock().ok().and_then(|db| db.list(10, None, None, false).ok()).unwrap_or_default();
        if let Some(row) = rows.get(index) {
            if let Err(error) = write_clip(&app, row) {
                let _ = app.emit("copy-failed", error);
            }
        }
    });
}

fn main() {
    let db = Db::open().expect("impossibile aprire SQLite");
    let state = AppState {
        db: Arc::new(Mutex::new(db)),
        last_hash: Arc::new(Mutex::new(String::new())),
        clipboard_gate: Mutex::new(()),
        watch: Arc::new(Mutex::new(WatchSettings::default())),
        seq: Arc::new(Mutex::new(0)),
    };

    // Shortcut globali desiderati (registrazione best-effort: Wayland/X11 e
    // Windows possono riservare alcune combo a livello di sistema).
    // La shelf usa la stringa configurabile (default Ctrl+Super+A:
    // Ctrl+Shift+V su Linux è "incolla" nel terminale; su Windows Super = tasto Win).
    let library = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyL);

    tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            toggle_window(app, "shelf");
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(move |app| {
            // Tray
            let toggle = MenuItem::with_id(app, "toggle", "Apri Shelf  (Ctrl+Super+A)", true, None::<&str>)?;
            let lib = MenuItem::with_id(app, "library", "Libreria  (Ctrl+Shift+L)", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Impostazioni", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "Pausa/Riprendi cattura", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Esci", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &lib, &settings, &pause, &quit])?;
            let _ = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => toggle_window(app, "shelf"),
                    "library" => toggle_window(app, "library"),
                    "settings" => toggle_window(app, "settings"),
                    "pause" => {
                        if let Ok(mut w) = app.state::<AppState>().watch.lock() {
                            w.auto_capture = !w.auto_capture;
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    use tauri::tray::TrayIconEvent;
                    if matches!(ev, TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. }) {
                        toggle_window(tray.app_handle(), "shelf");
                    }
                })
                .build(app)?;

            // Global shortcuts
            let _ = register_shelf_shortcut(app.handle(), &WatchSettings::default().shelf_shortcut);
            let handle = app.global_shortcut();
            let _ = handle.on_shortcut(library, |app, _s, ev| {
                if ev.state == ShortcutState::Pressed && shortcuts_on(app) {
                    toggle_window(app, "library");
                }
            });
            let note_sc = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyN);
            let cap_sc = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyS);
            let color_sc = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyP);
            let ocr_sc = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyT);
            let seq_sc = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::ArrowDown);
            let _ = handle.on_shortcut(note_sc, |app, _s, ev| {
                if ev.state == ShortcutState::Pressed && shortcuts_on(app) {
                    show_labeled(app, "shelf");
                    let _ = app.emit("open-note", ());
                }
            });
            let _ = handle.on_shortcut(cap_sc, |app, _s, ev| {
                if ev.state == ShortcutState::Pressed && shortcuts_on(app) {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move { let _ = capture_now(app).await; });
                }
            });
            let _ = handle.on_shortcut(color_sc, |app, _s, ev| {
                if ev.state == ShortcutState::Pressed && shortcuts_on(app) {
                    let _ = pick_color(app.clone());
                }
            });
            let _ = handle.on_shortcut(ocr_sc, |app, _s, ev| {
                if ev.state == ShortcutState::Pressed && shortcuts_on(app) {
                    let _ = capture_screen_text(app.clone());
                }
            });
            let _ = handle.on_shortcut(seq_sc, |app, _s, ev| {
                if ev.state == ShortcutState::Pressed && shortcuts_on(app) {
                    let state = app.state::<AppState>();
                    let idx = {
                        let mut seq = state.seq.lock().unwrap_or_else(|e| e.into_inner());
                        let i = *seq;
                        *seq = i.wrapping_add(1);
                        i
                    };
                    paste_recent(app, idx % 10);
                }
            });
            // Ctrl+Shift+0..9
            for (i, code) in [
                Code::Digit0, Code::Digit1, Code::Digit2, Code::Digit3, Code::Digit4,
                Code::Digit5, Code::Digit6, Code::Digit7, Code::Digit8, Code::Digit9,
            ]
            .iter()
            .enumerate()
            {
                let sc = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), *code);
                let idx = i;
                let _ = handle.on_shortcut(sc, move |app, _s, ev| {
                    if ev.state == ShortcutState::Pressed && shortcuts_on(app) {
                        paste_recent(app, idx);
                    }
                });
            }

            // Watcher clipboard in background
            let app_handle = app.handle().clone();
            std::thread::spawn(move || watcher::run_loop(app_handle));
            let remind_handle = app.handle().clone();
            std::thread::spawn(move || run_reminder_loop(remind_handle));

            if let Some(w) = app.get_webview_window("shelf") {
                fill_monitor(&w);
            }

            Ok(())
        })
        .on_window_event(|win, ev| {
            if let WindowEvent::CloseRequested { api, .. } = ev {
                api.prevent_close();
                hide_labeled(win.app_handle(), win.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_clips,
            search_clips,
            image_data,
            toggle_favorite,
            delete_clip,
            clear_history,
            export_clips,
            import_clips,
            backup_now,
            copy_clip,
            copy_text,
            combine_clips,
            get_categories,
            create_category,
            assign_category,
            get_spaces,
            create_space,
            delete_space,
            assign_space,
            get_space_clips,
            get_stats,
            ai_proxy,
            show_window,
            hide_window,
            finish_shelf_close,
            toggle_pin,
            get_reminders,
            set_reminder,
            clear_reminder,
            snooze_reminder,
            set_inline_shortcut,
            edit_clip,
            insert_note,
            apply_watch_settings,
            pick_color,
            capture_screen_text,
            capture_now,
        ])
        .run(tauri::generate_context!())
        .expect("errore avvio Boardify");

    let _ = Utc::now();
}
