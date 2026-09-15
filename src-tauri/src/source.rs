//! Finestra attiva su Linux (Hyprland / niri / Sway / X11 / kdotool).

use serde_json::Value;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub fn active_app() -> (String, String) {
    if let Ok(w) = active_win_pos_rs::get_active_window() {
        let name = w.process_name.trim().to_string();
        if !name.is_empty() && !is_unknown(&name) {
            return (name, w.title);
        }
    }
    compositor_active().unwrap_or_else(|| ("Unknown".into(), String::new()))
}

fn is_unknown(name: &str) -> bool {
    matches!(name.to_lowercase().as_str(), "unknown" | "n/a" | "none" | "")
}

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
        return kdotool_active().or_else(kwin_script_active);
    }
    if desktop.contains("HYPR") {
        return hypr_active();
    }
    if desktop.contains("NIRI") {
        return niri_active();
    }
    kdotool_active().or_else(x11_active)
}

fn hypr_active() -> Option<(String, String)> {
    let v = cmd_json("hyprctl", &["-j", "activewindow"])?;
    let class = v.get("class")?.as_str()?.trim();
    if class.is_empty() {
        return None;
    }
    let title = v.get("title").and_then(|x| x.as_str()).unwrap_or("");
    Some((class.to_string(), title.to_string()))
}

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

fn sway_active() -> Option<(String, String)> {
    let v = cmd_json("swaymsg", &["-t", "get_tree"])?;
    find_focused(&v)
}

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
        let title = v.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string();
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

fn kdotool_active() -> Option<(String, String)> {
    let class = cmd_stdout("kdotool", &["getactivewindow", "getwindowclassname"])?;
    if class.is_empty() || is_unknown(&class) {
        return None;
    }
    let title = cmd_stdout("kdotool", &["getactivewindow", "getwindowname"]).unwrap_or_default();
    Some((class, title))
}

fn kwin_script_active() -> Option<(String, String)> {
    let token = format!(
        "{:x}{:x}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .ok()?
            .as_millis()
    );
    let dir = dirs::data_dir()?.join("boardify");
    std::fs::create_dir_all(&dir).ok()?;
    let js_path = dir.join("kwin-active.js");
    let js = format!(
        r#"var w = workspace.activeWindow;
var klass = w && w.resourceClass ? w.resourceClass.toString() : "";
var title = w && w.caption ? w.caption.toString() : "";
print("BOARDIFY_SRC|{token}|" + klass + "|" + title);
"#
    );
    std::fs::write(&js_path, js).ok()?;
    let js_str = js_path.to_string_lossy();
    let qdbus = qdbus_bin();
    let _ = cmd_stdout_ms(
        qdbus,
        &[
            "org.kde.KWin",
            "/Scripting",
            "org.kde.kwin.Scripting.unloadScript",
            "boardify-active",
        ],
        200,
    );
    let id = cmd_stdout_ms(
        qdbus,
        &[
            "org.kde.KWin",
            "/Scripting",
            "org.kde.kwin.Scripting.loadScript",
            js_str.as_ref(),
            "boardify-active",
        ],
        250,
    )?;
    let id = id.trim();
    if id.is_empty() {
        return None;
    }
    let path = format!("/Scripting/Script{id}");
    let _ = cmd_stdout_ms(
        qdbus,
        &[
            "org.kde.KWin",
            &path,
            "org.kde.kwin.Script.run",
        ],
        250,
    );
    let marker = format!("BOARDIFY_SRC|{token}|");
    for _ in 0..12 {
        std::thread::sleep(Duration::from_millis(20));
        if let Some(hit) = journal_boardify(&marker) {
            return Some(hit);
        }
    }
    None
}

fn journal_boardify(marker: &str) -> Option<(String, String)> {
    let out = cmd_stdout_ms(
        "journalctl",
        &[
            "--user",
            "--no-pager",
            "-n",
            "40",
            "-o",
            "cat",
            "--since",
            "20 seconds ago",
        ],
        220,
    )?;
    for line in out.lines().rev() {
        if let Some(rest) = line.split(marker).nth(1) {
            let mut parts = rest.splitn(2, '|');
            let class = parts.next().unwrap_or("").trim();
            let title = parts.next().unwrap_or("").trim();
            if !class.is_empty() && !is_unknown(class) {
                return Some((class.to_string(), title.to_string()));
            }
        }
    }
    None
}

fn qdbus_bin() -> &'static str {
    if Path::new("/usr/bin/qdbus6").is_file() {
        "/usr/bin/qdbus6"
    } else if Path::new("/usr/bin/qdbus").is_file() {
        "/usr/bin/qdbus"
    } else {
        "qdbus6"
    }
}

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

fn cmd_json(bin: &str, args: &[&str]) -> Option<Value> {
    let out = cmd_stdout(bin, args)?;
    serde_json::from_str(&out).ok()
}

fn cmd_stdout(bin: &str, args: &[&str]) -> Option<String> {
    cmd_stdout_ms(bin, args, 140)
}

fn cmd_stdout_ms(bin: &str, args: &[&str], ms: u64) -> Option<String> {
    let mut child = Command::new(bin)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    return None;
                }
                let mut buf = String::new();
                child.stdout.take()?.read_to_string(&mut buf).ok()?;
                return Some(buf.trim().to_string());
            }
            Ok(None) if start.elapsed() > Duration::from_millis(ms) => {
                let _ = child.kill();
                return None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(6)),
            Err(_) => return None,
        }
    }
}
