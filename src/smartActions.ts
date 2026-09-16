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

export function normalizeShortcut(raw: string): string | null {  const t = raw.trim().toLowerCase();
  if (!t) return null;
  const withSemi = t.startsWith(";") ? t : `;${t}`;
  return /^;[a-z0-9-_]{2,24}$/.test(withSemi) ? withSemi : null;
}

/** Riempie i segnaposto nominati ({{x}}, ${x}, [XXX]); %s/%d restano intatti. */
export function fillTemplate(raw: string, values: Record<string, string>): { filled: string; missing: string[] } {
  const missing: string[] = [];
  const filled = raw
    .replace(/\{\{([^}\n]{1,40})\}\}/g, (m, k) => {
      const v = values[`{{${k}}}`] ?? values[k.trim()];
      if (v == null || v === "") { if (!missing.includes(m)) missing.push(m); return m; }
      return v;
    })
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, k) => {
      const v = values[m] ?? values[k];
      if (v == null || v === "") { if (!missing.includes(m)) missing.push(m); return m; }
      return v;
    })
    .replace(/\[([^\[\]\n]{1,30})\]/g, (m) => {
      const v = values[m];
      if (v == null || v === "") { if (!missing.includes(m)) missing.push(m); return m; }
      return v;
    });
  return { filled, missing };
}

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|vero_id|yclid)$/i;

/** Toglie i parametri di tracking da un URL (utm_*, fbclid, gclid…). Ritorna null se non è un URL. */
export function stripTrackingParams(raw: string): string | null {
  const t = raw.trim();
  if (!/^https?:\/\//i.test(t)) return null;
  try {
    const u = new URL(t);
    let changed = false;
    for (const k of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(k)) { u.searchParams.delete(k); changed = true; }
    }
    if (!changed) return t;
    // URL normalizza il resto: niente slash finali aggiunti oltre il dovuto
    return u.toString();
  } catch {
    return null;
  }
}
