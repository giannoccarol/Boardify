//! Risolve l'icona di un'app a partire dal process name.
//! Linux: temi Freedesktop + file `.desktop`. Windows: non ancora risolto
//! (TODO: estrarre l'icona dall'`.exe`), `resolve_data_url` restituisce `None`.

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

static CACHE: Mutex<Option<HashMap<String, Option<String>>>> = Mutex::new(None);

#[cfg(target_os = "linux")]
const THEMES: &[&str] = &[
    "hicolor",
    "Papirus",
    "Papirus-Dark",
    "breeze",
    "breeze-dark",
    "Adwaita",
    "Tela",
    "Tela-circle",
    "Tela-dark",
    "Vimix",
    "elementary",
    "candy-icons",
    "kora",
    "CachyOS",
];

#[cfg(target_os = "linux")]
const SIZES: &[&str] = &[
    "48x48", "32x32", "64x64", "128x128", "24x24", "scalable", "48", "32",
];

pub fn resolve_data_url(app: &str) -> Option<String> {
    let key = normalize(app);
    if key.is_empty() || key == "unknown" {
        return None;
    }
    let mut guard = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    let cache = guard.get_or_insert_with(HashMap::new);
    if let Some(hit) = cache.get(&key) {
        return hit.clone();
    }
    let found = lookup(&key).and_then(|p| file_to_data_url(&p));
    cache.insert(key, found.clone());
    found
}

fn file_to_data_url(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    if bytes.is_empty() || bytes.len() > 120_000 {
        return None;
    }
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => return None,
    };
    Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

fn normalize(app: &str) -> String {
    let base = Path::new(app.trim())
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(app)
        .to_lowercase();
    let base = base
        .strip_suffix(".desktop")
        .or_else(|| base.strip_suffix(".exe"))
        .unwrap_or(&base);
    base.trim_end_matches("-bin").replace(['_', ' '], "-")
}

#[derive(serde::Deserialize)]
struct Identity {
    id: String,
    label: String,
    aliases: Vec<String>,
}
/// Su Windows `lookup` è uno stub: questi restano per Linux (e per i test puri).
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
static IDENTITIES: LazyLock<Vec<Identity>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../src/app-identities.json"))
        .expect("valid app identities")
});

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn aliases(name: &str) -> Vec<String> {
    let mut out = vec![name.to_string()];
    for app in IDENTITIES.iter() {
        if std::iter::once(&app.id)
            .chain(std::iter::once(&app.label))
            .chain(&app.aliases)
            .any(|alias| normalize(alias) == name)
        {
            for alias in std::iter::once(&app.id).chain(&app.aliases) {
                if !out.contains(alias) {
                    out.push(alias.clone());
                }
            }
            break;
        }
    }
    // Keep the requested application first. Sorting used to make Brave the
    // first candidate for Google Chrome; substring matches confused Code/Codex.
    out
}

fn lookup(name: &str) -> Option<PathBuf> {
    #[cfg(target_os = "linux")]
    {
        return linux_lookup(name);
    }
    #[cfg(not(target_os = "linux"))]
    {
        // TODO(windows): risolvere l'icona dall'eseguibile (estrazione `.exe`).
        let _ = name;
        None
    }
}

#[cfg(target_os = "linux")]
fn linux_lookup(name: &str) -> Option<PathBuf> {
    let names = aliases(name);
    if let Some(path) = find_from_desktop(&names) {
        return Some(path);
    }
    let mut roots: Vec<PathBuf> = vec![
        PathBuf::from("/usr/share/icons"),
        PathBuf::from("/usr/share/pixmaps"),
        PathBuf::from("/usr/local/share/icons"),
        PathBuf::from("/var/lib/flatpak/exports/share/icons"),
        PathBuf::from("/var/lib/snapd/desktop/icons"),
    ];
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join(".local/share/icons"));
        roots.push(home.join(".icons"));
        roots.push(home.join(".local/share/flatpak/exports/share/icons"));
    }
    if let Some(data) = dirs::data_dir() {
        roots.push(data.join("icons"));
        roots.push(data.join("flatpak/exports/share/icons"));
    }

    for n in &names {
        for root in &roots {
            if root.file_name().and_then(|s| s.to_str()) == Some("pixmaps") {
                if let Some(p) = existing_with_ext(root, n) {
                    return Some(p);
                }
                continue;
            }
            for theme in THEMES {
                for size in SIZES {
                    for folder in ["apps", "places", "categories"] {
                        let dir = root.join(theme).join(size).join(folder);
                        if let Some(p) = existing_with_ext(&dir, n) {
                            return Some(p);
                        }
                    }
                }
            }
        }
    }

    None
}

#[cfg(target_os = "linux")]
fn existing_with_ext(dir: &Path, name: &str) -> Option<PathBuf> {
    for ext in ["png", "svg", "jpg", "jpeg", "webp"] {
        let p = dir.join(format!("{name}.{ext}"));
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn find_from_desktop(names: &[String]) -> Option<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/usr/share/applications"),
        PathBuf::from("/usr/local/share/applications"),
        PathBuf::from("/var/lib/flatpak/exports/share/applications"),
    ];
    if let Some(home) = dirs::home_dir() {
        dirs.insert(0, home.join(".local/share/applications"));
        dirs.push(home.join(".local/share/flatpak/exports/share/applications"));
    }
    // First resolve exact desktop IDs (including reverse-DNS names), then
    // StartupWMClass. A partial filename match can select a browser web app.
    let mut entries = Vec::new();
    for dir in dirs {
        let Ok(rd) = std::fs::read_dir(dir) else {
            continue;
        };
        for ent in rd.flatten() {
            let path = ent.path();
            if path.extension().and_then(|s| s.to_str()) != Some("desktop") {
                continue;
            }
            if let Ok(txt) = std::fs::read_to_string(&path) {
                entries.push((normalize(path.to_string_lossy().as_ref()), txt));
            }
        }
    }
    for by_class in [false, true] {
        for name in names {
            for (stem, txt) in &entries {
                let candidate = if by_class {
                    desktop_value(txt, "StartupWMClass").map(|v| normalize(&v))
                } else {
                    Some(stem.clone())
                };
                if candidate.as_deref() != Some(normalize(name).as_str()) {
                    continue;
                }
                if let Some(icon) = desktop_value(txt, "Icon") {
                    if Path::new(&icon).is_file() {
                        return Some(PathBuf::from(icon));
                    }
                    if let Some(p) = lookup_icon_name(&icon) {
                        return Some(p);
                    }
                }
            }
        }
    }
    None
}

/// Puro (solo parsing): condiviso così i test girano anche su Windows.
#[cfg(any(target_os = "linux", test))]
fn desktop_value(txt: &str, key: &str) -> Option<String> {
    let mut main = false;
    for line in txt.lines().map(str::trim) {
        if line.starts_with('[') {
            main = line == "[Desktop Entry]";
        }
        if main {
            if let Some((k, v)) = line.split_once('=') {
                if k == key && !v.trim().is_empty() {
                    return Some(v.trim().to_string());
                }
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn lookup_icon_name(icon: &str) -> Option<PathBuf> {
    let name = [".png", ".svg", ".jpg", ".jpeg", ".webp"]
        .iter()
        .find_map(|ext| icon.strip_suffix(ext))
        .unwrap_or(icon);
    let mut roots = vec![
        PathBuf::from("/usr/share/icons/hicolor"),
        PathBuf::from("/usr/share/pixmaps"),
        PathBuf::from("/usr/share/icons/Papirus"),
        PathBuf::from("/usr/share/icons/breeze"),
        PathBuf::from("/usr/share/icons/Adwaita"),
    ];
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join(".local/share/icons/hicolor"));
    }
    for root in roots {
        if root.file_name().and_then(|s| s.to_str()) == Some("pixmaps") {
            if let Some(p) = existing_with_ext(&root, name) {
                return Some(p);
            }
            continue;
        }
        for size in SIZES {
            let dir = root.join(size).join("apps");
            if let Some(p) = existing_with_ext(&dir, name) {
                return Some(p);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn browsers_never_share_aliases() {
        let chrome = aliases("google-chrome");
        assert_eq!(chrome[0], "google-chrome");
        assert!(!chrome
            .iter()
            .any(|s| s.contains("brave") || s.contains("chromium")));
        assert!(!aliases("brave-browser")
            .iter()
            .any(|s| s.contains("chrome")));
        assert!(!aliases("chromium")
            .iter()
            .any(|s| s.contains("google") || s.contains("brave")));
    }
    #[test]
    fn reverse_dns_ids_keep_the_application_segment() {
        assert_eq!(
            normalize("org.mozilla.firefox.desktop"),
            "org.mozilla.firefox"
        );
        assert_eq!(normalize("com.google.Chrome"), "com.google.chrome");
        assert!(aliases("com.google.chrome").contains(&"google-chrome".into()));
        assert_eq!(normalize("/usr/bin/firefox-bin"), "firefox");
    }
    #[test]
    fn similar_app_names_do_not_match() {
        assert!(!aliases("codex").contains(&"code".into()));
        assert_eq!(aliases("my-chrome-webapp"), ["my-chrome-webapp"]);
    }
    #[test]
    fn desktop_action_icon_does_not_override_main_icon() {
        let entry = "[Desktop Entry]\nIcon=com.google.Chrome\nStartupWMClass=Google-chrome\n[Desktop Action private]\nIcon=other\n";
        assert_eq!(
            desktop_value(entry, "Icon").as_deref(),
            Some("com.google.Chrome")
        );
        assert_eq!(
            desktop_value(entry, "StartupWMClass").as_deref(),
            Some("Google-chrome")
        );
    }
}
