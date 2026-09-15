//! Risolve l'icona di un'app a partire dal process name.
//! Linux: temi Freedesktop + file `.desktop`.
//! Windows: icona estratta dall'`.exe` (snapshot processi → `ExtractIconExW`,
//! resa 32x32 con alpha via DIB).

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
    let found = lookup_data_url(&key);
    cache.insert(key, found.clone());
    found
}

#[cfg(target_os = "linux")]
fn lookup_data_url(key: &str) -> Option<String> {
    lookup(key).and_then(|p| file_to_data_url(&p))
}

#[cfg(target_os = "windows")]
fn lookup_data_url(key: &str) -> Option<String> {
    windows_icon_data_url(key)
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn lookup_data_url(key: &str) -> Option<String> {
    let _ = key;
    None
}

#[cfg(target_os = "linux")]
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

#[cfg(target_os = "linux")]
fn lookup(name: &str) -> Option<PathBuf> {
    return linux_lookup(name);
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

// ── Windows: icona dall'eseguibile ─────────────────────────────
// `source.rs` ci dà il process name (es. `chrome.exe`); qui lo risolviamo
// in percorso `.exe` via snapshot dei processi e ne estraiamo l'icona.
// Cache: `resolve_data_url` sopra (una lookup per app).

/// Data URL PNG 32x32 dell'icona del processo `key`, oppure `None`.
#[cfg(target_os = "windows")]
fn windows_icon_data_url(key: &str) -> Option<String> {
    let path = windows_exe_path(key)?;
    let png = windows_exe_icon_png(&path, 32)?;
    if png.is_empty() || png.len() > 120_000 {
        return None;
    }
    Some(format!("data:image/png;base64,{}", STANDARD.encode(png)))
}

/// Percorso completo dell'`.exe` il cui nome matcha `key` o un suo alias.
#[cfg(target_os = "windows")]
fn windows_exe_path(key: &str) -> Option<String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::core::PWSTR;

    let wanted: Vec<String> = aliases(key)
        .iter()
        .flat_map(|a| {
            let a = a.to_lowercase();
            if a.ends_with(".exe") {
                vec![a]
            } else {
                vec![format!("{a}.exe"), a]
            }
        })
        .collect();

    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let pid = {
            let mut entry = PROCESSENTRY32W {
                dwSize: size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };
            let mut found = None;
            if Process32FirstW(snap, &mut entry).is_ok() {
                loop {
                    let len = entry
                        .szExeFile
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.szExeFile.len());
                    let exe =
                        String::from_utf16_lossy(&entry.szExeFile[..len]).to_lowercase();
                    if wanted.iter().any(|w| w == &exe) {
                        found = Some(entry.th32ProcessID);
                        break;
                    }
                    if Process32NextW(snap, &mut entry).is_err() {
                        break;
                    }
                }
            }
            found
        };
        let _ = CloseHandle(snap);
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid?).ok()?;
        let mut buf = [0u16; 1024];
        let mut size = buf.len() as u32;
        let status =
            QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut size);
        let _ = CloseHandle(handle);
        status.ok()?;
        String::from_utf16(buf.get(..size as usize)?).ok()
    }
}

/// Icona grande dell'`.exe` resa a `size`px con alpha, codificata PNG.
#[cfg(target_os = "windows")]
fn windows_exe_icon_png(exe_path: &str, size: i32) -> Option<Vec<u8>> {
    use windows::Win32::UI::Shell::ExtractIconExW;
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, HICON};
    use windows::core::HSTRING;

    unsafe {
        let mut large = HICON::default();
        let n = ExtractIconExW(
            &HSTRING::from(exe_path),
            0,
            Some(&mut large as *mut HICON),
            None,
            1,
        );
        if n == 0 || large.is_invalid() {
            return None;
        }
        let png = windows_hicon_to_png(large, size);
        let _ = DestroyIcon(large);
        png
    }
}

/// `HICON` → PNG: disegno su DIB 32bpp top-down (l'alpha sopravvive).
#[cfg(target_os = "windows")]
fn windows_hicon_to_png(icon: windows::Win32::UI::WindowsAndMessaging::HICON, size: i32) -> Option<Vec<u8>> {
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::UI::WindowsAndMessaging::{DrawIconEx, DI_NORMAL};

    unsafe {
        let screen = GetDC(None);
        if screen.is_invalid() {
            return None;
        }
        let mem = CreateCompatibleDC(Some(screen));
        if mem.is_invalid() {
            ReleaseDC(None, screen);
            return None;
        }
        let out = (|| {
            let mut info = BITMAPINFO::default();
            info.bmiHeader.biSize = size_of::<BITMAPINFOHEADER>() as u32;
            info.bmiHeader.biWidth = size;
            info.bmiHeader.biHeight = -size; // top-down
            info.bmiHeader.biPlanes = 1;
            info.bmiHeader.biBitCount = 32;
            info.bmiHeader.biCompression = BI_RGB.0;
            let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
            let dib = CreateDIBSection(Some(mem), &info, DIB_RGB_COLORS, &mut bits, None, 0).ok()?;
            let old = SelectObject(mem, dib.into());
            DrawIconEx(mem, 0, 0, icon, size, size, 0, None, DI_NORMAL).ok()?;
            let n = (size as usize) * (size as usize) * 4;
            let mut bgra = vec![0u8; n];
            let lines = GetDIBits(
                mem,
                dib,
                0,
                size as u32,
                Some(bgra.as_mut_ptr() as *mut core::ffi::c_void),
                &mut info,
                DIB_RGB_COLORS,
            );
            SelectObject(mem, old);
            let _ = DeleteObject(dib.into());
            if lines == 0 {
                return None;
            }
            // BGRA → RGBA.
            for px in bgra.chunks_exact_mut(4) {
                px.swap(0, 2);
            }
            let img = image::RgbaImage::from_raw(size as u32, size as u32, bgra)?;
            let mut png = Vec::new();
            img.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
                .ok()?;
            Some(png)
        })();
        let _ = DeleteDC(mem);
        ReleaseDC(None, screen);
        out
    }
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
