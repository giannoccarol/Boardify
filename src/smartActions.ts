/** Azioni smart stile extractUrl: email, telefono, path file, indirizzi (euristica IT). Solo frontend. */

export function extractEmail(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 400) return null;
  const m = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : null;
}

export function extractPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t || t.length > 64 || t.includes("\n") || /https?:\/\//i.test(t)) return null;
  if (!/^\+?[\d\s./()_-]{6,26}$/.test(t)) return null;
  const digits = t.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 13) return null;
  if (/^\d{10}$/.test(digits) || /^\d{13}$/.test(digits)) return null; // timestamp → units.ts
  return t;
}

export function extractFilePath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 500) return null;
  const t = raw.trim();
  if (t.includes("\n")) return null;
  const m =
    t.match(/file:\/\/\S+/) ||
    t.match(/(^|\s)(\/(home|tmp|etc|usr|var|opt|mnt|media)\/\S+)/) ||
    t.match(/(^|\s)(~\/\S+)/);
  if (!m) return null;
  let p = (m[2] ?? m[0]).trim().replace(/[),.;:'"]+$/, "");
  if (p.startsWith("file://")) p = decodeURIComponent(p.slice(7));
  return p || null;
}

export function isAbsolutePath(p: string): boolean {
  return p.startsWith("/");
}

const STREET = /\b(via|viale|piazza|corso|largo|strada|vicolo|contrada)\b/i;

export function isLikelyAddress(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const t = raw.trim();
  if (!t || t.length > 120 || t.includes("\n")) return false;
  return STREET.test(t) && /\d/.test(t);
}

export function toMapsUrl(query: string): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query.trim())}`;
}

/** Mirror frontend delle euristiche Rust (detect.rs): video, payload QR, placeholder template. */
export function isVideoUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const t = raw.trim().toLowerCase();
  if (!t || t.length > 4000) return false;
  return (
    t.includes("youtube.com/watch") ||
    t.includes("youtu.be/") ||
    t.includes("youtube.com/shorts") ||
    t.includes("vimeo.com/") ||
    t.includes(".mp4") ||
    t.includes(".mov") ||
    t.includes(".webm") ||
    t.includes(".m4v")
  );
}

export function isQrPayload(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const t = raw.trim();
  if (!t || t.length > 2000) return false;
  return /^(WIFI:|otpauth:\/\/|BEGIN:VCARD)/i.test(t);
}

export function isDirectVideo(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const t = raw.trim().split(/\s/)[0].toLowerCase().split("?")[0];
  return /\.(mp4|mov|webm|m4v)$/.test(t);
}

export function extractPlaceholders(raw: string | null | undefined): string[] {
  if (!raw || raw.length > 8000) return [];
  const out = new Set<string>();
  for (const m of raw.matchAll(/\{\{[^}\n]{1,40}\}\}|\$\{[A-Za-z_][A-Za-z0-9_]*\}|\[[^\[\]\n]{1,30}\]|%[sd]/g)) {
    out.add(m[0]);
    if (out.size >= 12) break;
  }
  return [...out];
}

export function normalizeShortcut(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  const withSemi = t.startsWith(";") ? t : `;${t}`;
  return /^;[a-z0-9-_]{2,24}$/.test(withSemi) ? withSemi : null;
}
