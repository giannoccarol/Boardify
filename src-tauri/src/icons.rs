//! Risolve l'icona Freedesktop di un'app a partire dal process name.

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

static CACHE: Mutex<Option<HashMap<String, Option<String>>>> = Mutex::new(None);

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
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(app)
        .to_lowercase();
    base.trim_end_matches("-bin")
        .trim_end_matches(".exe")
        .trim_end_matches(".desktop")
        .replace('_', "-")
}

fn aliases(name: &str) -> Vec<String> {
    let mut out = vec![name.to_string()];
    let extra: &[(&str, &[&str])] = &[
        (
            "firefox",
            &[
                "firefox",
                "firefox-esr",
                "org.mozilla.firefox",
                "firefox-bin",
                "navigator",
            ],
        ),
        (
            "chrome",
            &[
                "google-chrome",
                "google-chrome-stable",
                "chromium",
                "chromium-browser",
                "brave-browser",
                "com.google.Chrome",
            ],
        ),
        ("chromium", &["chromium", "chromium-browser"]),
        (
            "code",
            &[
                "code",
                "code-oss",
                "com.visualstudio.code",
                "vscodium",
                "codium",
                "visual-studio-code",
            ],
        ),
        ("cursor", &["cursor", "co.anysphere.cursor"]),
        ("slack", &["slack", "com.slack.Slack"]),
        ("discord", &["discord", "com.discordapp.Discord"]),
        (
            "telegram",
            &["telegram", "telegram-desktop", "org.telegram.desktop"],
        ),
        ("figma", &["figma", "io.github.Figma_Linux.figma_linux"]),
        ("spotify", &["spotify", "com.spotify.Client"]),
        ("kitty", &["kitty", "kitty-terminal"]),
        ("ghostty", &["ghostty", "com.mitchellh.ghostty"]),
        ("alacritty", &["Alacritty", "alacritty"]),
        ("nautilus", &["org.gnome.Nautilus", "nautilus"]),
        ("dolphin", &["org.kde.dolphin", "dolphin"]),
        ("thunar", &["org.xfce.thunar", "thunar"]),
        ("obsidian", &["obsidian", "md.obsidian.Obsidian"]),
        ("zen", &["zen-browser", "app.zen_browser.zen", "zen"]),
        ("librewolf", &["librewolf", "io.gitlab.librewolf-community"]),
        ("vivaldi", &["vivaldi", "vivaldi-stable"]),
        ("opera", &["opera"]),
        ("signal", &["signal", "org.signal.Signal"]),
        ("element", &["element-desktop", "im.riot.Riot", "element"]),
        ("steam", &["steam", "com.valvesoftware.Steam"]),
        ("gimp", &["gimp", "org.gimp.GIMP"]),
        ("inkscape", &["inkscape", "org.inkscape.Inkscape"]),
        ("blender", &["blender", "org.blender.Blender"]),
        ("krita", &["krita", "org.kde.krita"]),
        ("thunderbird", &["thunderbird", "org.mozilla.Thunderbird"]),
        ("brave", &["brave-browser", "com.brave.Browser", "brave"]),
        ("edge", &["microsoft-edge", "com.microsoft.Edge"]),
        ("arc", &["arc", "company.thebrowser.Browser"]),
    ];
    for (k, names) in extra {
        if name == *k || name.contains(k) || names.iter().any(|n| name == *n) {
            for n in *names {
                out.push((*n).to_string());
            }
            out.push((*k).to_string());
        }
    }
    if name == "navigator" {
        out.push("firefox".into());
    }
    out.sort();
    out.dedup();
    out
}

fn lookup(name: &str) -> Option<PathBuf> {
    let names = aliases(name);
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

    find_from_desktop(&names)
}

fn existing_with_ext(dir: &Path, name: &str) -> Option<PathBuf> {
    for ext in ["png", "svg", "jpg", "jpeg", "webp"] {
        let p = dir.join(format!("{name}.{ext}"));
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

fn find_from_desktop(names: &[String]) -> Option<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/usr/share/applications"),
        PathBuf::from("/usr/local/share/applications"),
        PathBuf::from("/var/lib/flatpak/exports/share/applications"),
    ];
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".local/share/applications"));
    }
    for dir in dirs {
        let Ok(rd) = std::fs::read_dir(&dir) else {
            continue;
        };
        for ent in rd.flatten() {
            let path = ent.path();
            if path.extension().and_then(|s| s.to_str()) != Some("desktop") {
                continue;
            }
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            if !names.iter().any(|n| stem == *n || stem.contains(n)) {
                continue;
            }
            let Ok(txt) = std::fs::read_to_string(&path) else {
                continue;
            };
            if let Some(icon) = desktop_icon(&txt) {
                if Path::new(&icon).is_file() {
                    return Some(PathBuf::from(icon));
                }
                if let Some(p) = lookup_icon_name(&icon) {
                    return Some(p);
                }
            }
        }
    }
    None
}

fn desktop_icon(txt: &str) -> Option<String> {
    for line in txt.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("Icon=") {
            return Some(rest.trim().to_string());
        }
    }
    None
}

fn lookup_icon_name(icon: &str) -> Option<PathBuf> {
    let name = Path::new(icon)
        .file_stem()
        .and_then(|s| s.to_str())
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
