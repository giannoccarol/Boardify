//! Finestra attiva: Linux (Hyprland / niri / Sway / X11 / kdotool) e Windows.
//! Su Windows usa `active-win-pos-rs` (foreground window), con fallback `Unknown`.

#[cfg(any(target_os = "linux", test))]
use serde_json::Value;
#[cfg(target_os = "linux")]
use std::io::Read;
#[cfg(target_os = "linux")]
use std::path::Path;
#[cfg(target_os = "linux")]
use std::process::{Command, Stdio};
#[cfg(target_os = "linux")]
use std::time::{Duration, Instant};

pub fn active_app() -> (String, String) {
    #[cfg(target_os = "windows")]
    {
        return windows_active();
    }
    #[cfg(target_os = "linux")]
    {
        return linux_active();
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        return ("Unknown".into(), String::new());
    }
}

/// Windows: finestra in foreground via crate cross-platform.
/// Mai vuoto/"unknown" verso il chiamante: fallback `Unknown`.
#[cfg(target_os = "windows")]
fn windows_active() -> (String, String) {
    active_win_pos_rs::get_active_window()
        .ok()
        .and_then(|w| {
            let name = w.process_name.trim().to_string();
            (!is_unknown(&name)).then_some((name, w.title))
        })
        .unwrap_or_else(|| ("Unknown".into(), String::new()))
}

#[cfg(target_os = "linux")]
fn linux_active() -> (String, String) {
    // X11's _NET_ACTIVE_WINDOW can keep pointing at Chrome after focus moved
    // to a native Wayland app. Never use that stale value on Wayland.
    let wayland = is_wayland();
    let found = if wayland {
        compositor_active()
    } else {
        active_win_pos_rs::get_active_window()
            .ok()
            .and_then(|w| {
                let name = w.process_name.trim().to_string();
                (!is_unknown(&name)).then_some((name, w.title))
            })
            .or_else(x11_active)
    };
    found.unwrap_or_else(|| ("Unknown".into(), String::new()))
}

#[cfg(target_os = "linux")]
fn is_wayland() -> bool {
    std::env::var("XDG_SESSION_TYPE").is_ok_and(|s| s.eq_ignore_ascii_case("wayland"))
        || std::env::var_os("WAYLAND_DISPLAY").is_some()
}

fn is_unknown(name: &str) -> bool {
    matches!(
        name.to_lowercase().as_str(),
        "unknown" | "n/a" | "none" | ""
    )
}

#[cfg(target_os = "linux")]
fn compositor_active() -> Option<(String, String)> {
    if std::env::var_os("HYPRLAND_INSTANCE_SIGNATURE").is_some() {
        return hypr_active();
    }
    if std::env::var_os("NIRI_SOCKET").is_some() {
        return niri_active();
    }
    if std::env::var_os("SWAYSOCK").is_some() {
        return sway_active();
    }
    let desktop = std::env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .to_uppercase();
    if desktop.contains("KDE") || desktop.contains("PLASMA") {
        return kwin_script_active().or_else(kdotool_active);
    }
    if desktop.contains("HYPR") {
        return hypr_active();
    }
    if desktop.contains("NIRI") {
        return niri_active();
    }
    kdotool_active()
}

#[cfg(target_os = "linux")]
fn hypr_active() -> Option<(String, String)> {
    let v = cmd_json("hyprctl", &["-j", "activewindow"])?;
    let class = v.get("class")?.as_str()?.trim();
    if class.is_empty() {
        return None;
    }
    let title = v.get("title").and_then(|x| x.as_str()).unwrap_or("");
    Some((class.to_string(), title.to_string()))
}

#[cfg(target_os = "linux")]
fn niri_active() -> Option<(String, String)> {
    let v = cmd_json("niri", &["msg", "-j", "focused-window"])?;
    let class = v
        .get("app_id")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim();
    if class.is_empty() {
        return None;
    }
    let title = v.get("title").and_then(|x| x.as_str()).unwrap_or("");
    Some((class.to_string(), title.to_string()))
}

#[cfg(target_os = "linux")]
fn sway_active() -> Option<(String, String)> {
    let v = cmd_json("swaymsg", &["-t", "get_tree"])?;
    find_focused(&v)
}

/// Puro (solo JSON): condiviso così i test girano anche su Windows.
#[cfg(any(target_os = "linux", test))]
fn find_focused(v: &Value) -> Option<(String, String)> {
    if v.get("focused").and_then(|x| x.as_bool()) == Some(true) {
        let app = v
            .get("app_id")
            .and_then(|x| x.as_str())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                v.get("window_properties")
                    .and_then(|p| p.get("class"))
                    .and_then(|x| x.as_str())
            })
            .unwrap_or("")
            .to_string();
        let title = v
            .get("name")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        if !app.is_empty() {
            return Some((app, title));
        }
    }
    for key in ["nodes", "floating_nodes"] {
        if let Some(arr) = v.get(key).and_then(|n| n.as_array()) {
            for n in arr {
                if let Some(hit) = find_focused(n) {
                    return Some(hit);
                }
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn kdotool_active() -> Option<(String, String)> {
    let id = cmd_stdout("kdotool", &["getactivewindow"])?;
    let class = cmd_stdout("kdotool", &["getwindowclassname", &id])?;
    if class.is_empty() || is_unknown(&class) {
        return None;
    }
    let title = cmd_stdout("kdotool", &["getwindowname", &id]).unwrap_or_default();
    Some((class, title))
}

#[cfg(target_os = "linux")]
struct SourceReply(std::sync::mpsc::SyncSender<(String, String)>);

#[cfg(target_os = "linux")]
#[zbus::interface(name = "com.boardify.Source")]
impl SourceReply {
    fn report(&self, app: String, title: String) {
        let _ = self.0.try_send((app, title));
    }
}

// Unload only our own short-lived query, including on timeout/failure. No
// focused window metadata is printed to the journal or left in a data file.
#[cfg(target_os = "linux")]
struct KwinQuery {
    name: String,
    file: std::path::PathBuf,
}
#[cfg(target_os = "linux")]
impl Drop for KwinQuery {
    fn drop(&mut self) {
        let _ = cmd_stdout_ms(
            qdbus_bin(),
            &[
                "org.kde.KWin",
                "/Scripting",
                "org.kde.kwin.Scripting.unloadScript",
                &self.name,
            ],
            300,
        );
        let _ = std::fs::remove_file(&self.file);
    }
}

#[cfg(target_os = "linux")]
fn kwin_script_active() -> Option<(String, String)> {
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    let connection = zbus::blocking::connection::Builder::session()
        .ok()?
        .method_timeout(Duration::from_millis(400))
        .serve_at("/Source", SourceReply(tx))
        .ok()?
        .build()
        .ok()?;
    let destination = serde_json::to_string(connection.unique_name()?.as_str()).ok()?;
    let name = format!("boardify-source-{}", uuid::Uuid::new_v4());
    let query = KwinQuery {
        file: std::env::temp_dir().join(format!("{name}.js")),
        name,
    };
    let js = format!(
        r#"var w = workspace.activeWindow || workspace.activeClient;
var app = w ? (w.desktopFileName || w.resourceClass || "").toString() : "";
var title = w ? (w.caption || "").toString() : "";
callDBus({destination}, "/Source", "com.boardify.Source", "Report", app, title);
"#
    );
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&query.file)
            .ok()?;
        file.write_all(js.as_bytes()).ok()?;
    }
    let id = cmd_stdout_ms(
        qdbus_bin(),
        &[
            "org.kde.KWin",
            "/Scripting",
            "org.kde.kwin.Scripting.loadScript",
            query.file.to_str()?,
            &query.name,
        ],
        400,
    )?
    .parse::<u32>()
    .ok()?;
    cmd_stdout_ms(
        qdbus_bin(),
        &[
            "org.kde.KWin",
            &format!("/Scripting/Script{id}"),
            "org.kde.kwin.Script.run",
        ],
        400,
    )?;
    let (app, title) = rx.recv_timeout(Duration::from_millis(400)).ok()?;
    if is_unknown(app.trim()) {
        None
    } else {
        Some((app.trim().to_string(), title))
    }
}

#[cfg(target_os = "linux")]
fn qdbus_bin() -> &'static str {
    if Path::new("/usr/bin/qdbus6").is_file() {
        "/usr/bin/qdbus6"
    } else if Path::new("/usr/bin/qdbus").is_file() {
        "/usr/bin/qdbus"
    } else {
        "qdbus6"
    }
}

#[cfg(target_os = "linux")]
fn x11_active() -> Option<(String, String)> {
    if std::env::var_os("DISPLAY").is_none() {
        return None;
    }
    let root = cmd_stdout("xprop", &["-root", "_NET_ACTIVE_WINDOW"])?;
    let id = root
        .split_whitespace()
        .last()
        .filter(|s| s.starts_with("0x") && *s != "0x0")?;
    let raw = cmd_stdout("xprop", &["-id", id, "WM_CLASS", "WM_NAME"])?;
    let mut class = String::new();
    let mut title = String::new();
    for line in raw.lines() {
        if line.starts_with("WM_CLASS") {
            if let Some(c) = line.rsplit('"').nth(1) {
                class = c.to_string();
            }
        } else if line.starts_with("WM_NAME") || line.starts_with("_NET_WM_NAME") {
            if let Some(c) = line.rsplit('"').nth(1) {
                title = c.to_string();
            }
        }
    }
    if class.is_empty() {
        None
    } else {
        Some((class, title))
    }
}

#[cfg(target_os = "linux")]
fn cmd_json(bin: &str, args: &[&str]) -> Option<Value> {
    let out = cmd_stdout(bin, args)?;
    serde_json::from_str(&out).ok()
}

#[cfg(target_os = "linux")]
fn cmd_stdout(bin: &str, args: &[&str]) -> Option<String> {
    cmd_stdout_ms(bin, args, 140)
}

#[cfg(target_os = "linux")]
fn cmd_stdout_ms(bin: &str, args: &[&str], ms: u64) -> Option<String> {
    let mut child = Command::new(bin)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    // Drain while the process runs: a large Sway tree must not fill the pipe
    // and deadlock before try_wait reports completion.
    let mut stdout = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut buf = String::new();
        stdout.read_to_string(&mut buf).map(|_| buf)
    });
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return None;
                }
                let buf = reader.join().ok()?.ok()?;
                return Some(buf.trim().to_string());
            }
            Ok(None) if start.elapsed() > Duration::from_millis(ms) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(6)),
            Err(_) => return None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sway_prefers_focused_native_app_and_handles_floating_xwayland_windows() {
        let tree = serde_json::json!({"nodes": [{"app_id": "google-chrome", "focused": false}],
            "floating_nodes": [{"focused": true, "app_id": "org.kde.dolphin", "name": "Files"}]});
        assert_eq!(
            find_focused(&tree),
            Some(("org.kde.dolphin".into(), "Files".into()))
        );
        let xwayland = serde_json::json!({"focused": true, "window_properties": {"class": "Brave-browser"}, "name": "Page"});
        assert_eq!(
            find_focused(&xwayland),
            Some(("Brave-browser".into(), "Page".into()))
        );
    }
    #[test]
    #[cfg(target_os = "linux")]
    #[ignore = "requires a running Plasma session; reads app identity only"]
    fn kwin_live_source_query() {
        let source = kwin_script_active().expect("KWin must return the focused app over D-Bus");
        assert!(!is_unknown(&source.0));
        // Do not print the user's window title in test output.
    }
}
