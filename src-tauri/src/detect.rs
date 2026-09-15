//! Euristiche di classificazione: link, code, color, sensitive. Tutto locale.

use regex::Regex;
use std::sync::OnceLock;

fn re(p: &str) -> &Regex {
    static CACHE: OnceLock<std::collections::HashMap<String, Regex>> = OnceLock::new();
    // semplice cache globale non ideale ma ok per MVP; in realtà compiliamo ogni volta le poche regex critiche
    let _ = CACHE;
    Box::leak(Box::new(Regex::new(p).unwrap()))
}

pub fn detect_kind(text: &str) -> &'static str {
    let t = text.trim();
    if t.is_empty() {
        return "text";
    }
    if is_color(t) {
        return "color";
    }
    if is_link(t) {
        return "link";
    }
    if is_code(t) {
        return "code";
    }
    "text"
}

pub fn is_link(t: &str) -> bool {
    let s = t.trim();
    if s.contains('\n') && s.lines().count() > 3 {
        return false;
    }
    let r = re(r"(?i)^(https?://|www\.|[a-z0-9-]+\.(com|it|org|dev|io|app|net|eu|sh)(/\S*)?)$");
    if r.is_match(s.split_whitespace().next().unwrap_or("")) && s.len() < 2000 {
        return true;
    }
    let r2 = re(r"(?i)https?://\S+");
    r2.is_match(s) && s.len() < 2000 && s.lines().count() <= 2
}

const NAMED: &[(&str, &str)] = &[
    ("black", "#000000"),
    ("white", "#FFFFFF"),
    ("red", "#FF0000"),
    ("green", "#008000"),
    ("blue", "#0000FF"),
    ("yellow", "#FFFF00"),
    ("orange", "#FFA500"),
    ("purple", "#800080"),
    ("pink", "#FFC0CB"),
    ("cyan", "#00FFFF"),
    ("magenta", "#FF00FF"),
    ("gray", "#808080"),
    ("grey", "#808080"),
    ("navy", "#000080"),
    ("teal", "#008080"),
    ("lime", "#00FF00"),
    ("maroon", "#800000"),
    ("olive", "#808000"),
    ("silver", "#C0C0C0"),
    ("aqua", "#00FFFF"),
    ("fuchsia", "#FF00FF"),
    ("rebeccapurple", "#663399"),
    ("tomato", "#FF6347"),
    ("gold", "#FFD700"),
    ("coral", "#FF7F50"),
    ("salmon", "#FA8072"),
    ("khaki", "#F0E68C"),
    ("violet", "#EE82EE"),
    ("indigo", "#4B0082"),
    ("crimson", "#DC143C"),
    ("azure", "#F0FFFF"),
];

fn strip_color(t: &str) -> String {
    t.trim()
        .trim_matches(|c| c == '"' || c == '\'' || c == '`' || c == ';')
        .trim()
        .to_string()
}

fn expand_hex(raw: &str) -> Option<String> {
    let mut h = raw.trim().to_uppercase();
    if h.starts_with("0X") {
        h = format!("#{}", &h[2..]);
    }
    if !h.starts_with('#') {
        h = format!("#{h}");
    }
    let chars: Vec<char> = h.chars().skip(1).collect();
    let out = match chars.len() {
        3 => format!(
            "#{}{}{}{}{}{}",
            chars[0], chars[0], chars[1], chars[1], chars[2], chars[2]
        ),
        4 => format!(
            "#{}{}{}{}{}{}",
            chars[0], chars[0], chars[1], chars[1], chars[2], chars[2]
        ),
        6 => format!("#{}", chars.iter().collect::<String>()),
        8 => format!("#{}", chars.iter().take(6).collect::<String>()),
        _ => return None,
    };
    Some(out)
}

fn parse_hex_token(s: &str) -> Option<String> {
    let hex = re(r"(?i)^#?(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$");
    if !hex.is_match(s) {
        return None;
    }
    let bare = s.trim_start_matches('#');
    if !s.starts_with('#') && !bare.chars().any(|c| c.is_ascii_digit()) {
        return None;
    }
    expand_hex(s)
}

fn parse_rgb_token(s: &str) -> Option<String> {
    if !re(r"(?i)^rgba?\(").is_match(s) {
        return None;
    }
    let nums: Vec<f32> = re(r"\d+(?:\.\d+)?")
        .find_iter(s)
        .filter_map(|m| m.as_str().parse().ok())
        .take(3)
        .collect();
    if nums.len() != 3 {
        return None;
    }
    let pct = s.contains('%');
    let to_u8 = |v: f32| -> u8 {
        if pct && v <= 100.0 {
            (v / 100.0 * 255.0).round().clamp(0.0, 255.0) as u8
        } else {
            v.round().clamp(0.0, 255.0) as u8
        }
    };
    Some(format!(
        "#{:02X}{:02X}{:02X}",
        to_u8(nums[0]),
        to_u8(nums[1]),
        to_u8(nums[2])
    ))
}

fn parse_hsl_token(s: &str) -> Option<String> {
    if !re(r"(?i)^hsla?\(").is_match(s) {
        return None;
    }
    let nums: Vec<f32> = re(r"\d+(?:\.\d+)?")
        .find_iter(s)
        .filter_map(|m| m.as_str().parse().ok())
        .take(3)
        .collect();
    if nums.len() != 3 {
        return None;
    }
    Some(hsl_to_hex(nums[0], nums[1], nums[2]))
}

fn hsl_to_hex(h: f32, s: f32, l: f32) -> String {
    let s = (s / 100.0).clamp(0.0, 1.0);
    let l = (l / 100.0).clamp(0.0, 1.0);
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let h = ((h % 360.0) + 360.0) % 360.0 / 60.0;
    let x = c * (1.0 - (h % 2.0 - 1.0).abs());
    let (r1, g1, b1) = match h as i32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let m = l - c / 2.0;
    let ch = |v: f32| ((v + m) * 255.0).round().clamp(0.0, 255.0) as u8;
    format!("#{:02X}{:02X}{:02X}", ch(r1), ch(g1), ch(b1))
}

fn parse_color_token(s: &str) -> Option<String> {
    let s = strip_color(s);
    if s.is_empty() || s.len() > 180 {
        return None;
    }
    let low = s.to_lowercase();
    for (name, hex) in NAMED {
        if low == *name {
            return Some((*hex).to_string());
        }
    }
    if low.starts_with("0x") && low.len() >= 8 {
        return parse_hex_token(&low[2..]);
    }
    if let Some(h) = parse_hex_token(&s) {
        return Some(h);
    }
    if let Some(h) = parse_rgb_token(&s) {
        return Some(h);
    }
    parse_hsl_token(&s)
}

pub fn extract_color(t: &str) -> Option<String> {
    let s = strip_color(t);
    if is_link(&s) {
        return None;
    }
    if s.to_ascii_lowercase().contains("gradient(") {
        return None;
    }
    if let Some(h) = parse_color_token(&s) {
        return Some(h);
    }
    if s.len() > 220 {
        return None;
    }
    if let Some(m) = re(r"(?i)#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})\b").find(&s) {
        return parse_hex_token(m.as_str());
    }
    if let Some(m) = re(r"(?i)rgba?\([^)]{5,80}\)").find(&s) {
        return parse_rgb_token(m.as_str());
    }
    if let Some(m) = re(r"(?i)hsla?\([^)]{5,80}\)").find(&s) {
        return parse_hsl_token(m.as_str());
    }
    None
}

pub fn is_color(t: &str) -> bool {
    extract_color(t).is_some()
}

pub fn is_code(t: &str) -> bool {
    let lines = t.lines().count();
    if lines < 2 && t.len() < 120 {
        return false;
    }
    let keywords = [
        "fn ", "import ", "from ", "const ", "let ", "function", "class ", "def ", "return ",
        "public ", "private ", "{", "}", "=>", "->", "println", "console.", "use ",
        "SELECT ", "INSERT ", "UPDATE ", "#include", "package ", "interface ",
    ];
    let mut score = 0;
    for k in keywords {
        if t.contains(k) {
            score += 1;
        }
    }
    if t.contains(';') && t.contains(['{', '}', '(', ')']) {
        score += 2;
    }
    if t.lines().any(|l| l.starts_with("  ") || l.starts_with('\t')) {
        score += 1;
    }
    score >= 2
}

pub fn is_email(t: &str) -> bool {
    let s = t.trim();
    if s.len() > 4000 {
        return false;
    }
    if re(r"(?i)^mailto:").is_match(s) {
        return true;
    }
    re(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}").is_match(s)
}

pub fn is_video_url(t: &str) -> bool {
    let s = t.trim().to_lowercase();
    if s.len() > 4000 {
        return false;
    }
    s.contains("youtube.com/watch")
        || s.contains("youtu.be/")
        || s.contains("youtube.com/shorts")
        || s.contains("vimeo.com/")
        || s.contains(".mp4")
        || s.contains(".mov")
        || s.contains(".webm")
        || s.contains(".m4v")
}

pub fn is_template(t: &str) -> bool {
    if t.len() > 8000 {
        return false;
    }
    re(r"\{\{[^}\n]{1,40}\}\}").is_match(t)
        || re(r"\$\{[A-Za-z_][A-Za-z0-9_]*\}").is_match(t)
        || re(r"\[[^\[\]\n]{1,30}\]").is_match(t)
        || re(r"%[sd]").is_match(t)
}

/// Payload pensati per diventare QR: link brevi + formati QR standard (WiFi, OTP, vCard).
/// I link sono QR-generabili per definizione (vedi azione "Mostra QR" nella preview).
pub fn is_qr_payload(t: &str) -> bool {
    let s = t.trim();
    if s.len() > 2000 {
        return false;
    }
    is_link(s)
        || re(r"(?i)^WIFI:").is_match(s)
        || re(r"(?i)^otpauth://").is_match(s)
        || re(r"(?i)^BEGIN:VCARD").is_match(s)
}

pub fn is_sensitive(t: &str) -> bool {
    let pats = [
        r"(?i)(password|passwd|pwd)\s*[:=]\s*\S+",
        r"(?i)(api[_-]?key|secret|token)\s*[:=]\s*\S+",
        r"sk-(live|test)-[A-Za-z0-9]{8,}",
        r"ghp_[A-Za-z0-9]{20,}",
        r"xox[bap]-[A-Za-z0-9-]{10,}",
        r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b",
        r"-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----",
        r"(?i)bearer\s+[A-Za-z0-9._~-]{10,}",
    ];
    for p in pats {
        if re(p).is_match(t) {
            return true;
        }
    }
    false
}

// ponytail: un solo test per le nuove euristiche, aggiungi casi se una euristica sbaglia sul serio
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn smart_facets() {
        assert!(is_email("scrivi a mario.rossi@example.it ciao"));
        assert!(is_email("mailto:info@azienda.com"));
        assert!(!is_email("ciao mondo"));
        assert!(is_video_url("https://www.youtube.com/watch?v=FMldm8ssH0o"));
        assert!(is_video_url("https://vimeo.com/12345"));
        assert!(!is_video_url("https://example.com/blog"));
        assert!(is_template("Ciao {{nome}},\nla fattura [NUMERO] è pronta"));
        assert!(!is_template("ciao mondo"));
        assert!(is_qr_payload("https://example.com/menu"));
        assert!(is_qr_payload("WIFI:T:WPA;S:Casa;P:secret;;"));
        assert!(!is_qr_payload(&"x".repeat(3000)));
    }
}
