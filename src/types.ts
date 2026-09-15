import { parseColorCss } from "./color";

export type ClipKind = "text" | "link" | "code" | "color" | "image" | "file";

export interface Clip {
  id: string;
  kind: ClipKind | string;
  text?: string | null;
  preview: string;
  image_path?: string | null;
  color_hex?: string | null;
  file_paths?: string[] | null;
  source_app: string;
  source_icon?: string | null;
  window_title: string;
  hash: string;
  is_favorite: boolean;
  is_sensitive: boolean;
  ocr_text?: string | null;
  copy_count: number;
  categories: string[];
  created_at: string;
  is_pinned?: boolean;
  inline_shortcut?: string | null;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  count: number;
}

export function timeAgo(iso: string): string {
  try {
    const d = new Date(iso).getTime();
    const s = Math.max(1, Math.floor((Date.now() - d) / 1000));
    if (s < 60) return `${s}s fa`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min fa`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} h fa`;
    const g = Math.floor(h / 24);
    if (g === 1) return "ieri";
    if (g < 7) return `${g} g fa`;
    return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

export function kindLabel(kind: string): string {
  switch (kind) {
    case "text": return "Testo";
    case "link": return "Link";
    case "code": return "Codice";
    case "color": return "Colore";
    case "image": return "Immagine";
    case "file": return "File";
    default: return kind;
  }
}

const APP_PALETTE = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899"];

export function prettyApp(name: string): string {
  const n = (name.split(/[/\\]/).pop() ?? name).replace(/\.(desktop|exe)$/i, "");
  return n.replace(/[-_]+/g, " ").trim() || "App";
}

export function appColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return APP_PALETTE[h % APP_PALETTE.length];
}

export function appInitial(name: string): string {
  const p = prettyApp(name);
  return (p[0] ?? "?").toUpperCase();
}

export function cardTitle(clip: Clip): string {
  const raw = (clip.text || clip.preview || "").trim();
  const parsed = clip.color_hex || parseColorCss(raw);
  if (parsed && (clip.kind === "color" || raw.length < 80)) {
    return (clip.color_hex || raw.split("\n")[0] || parsed).slice(0, 48);
  }
  return raw.split("\n")[0].slice(0, 56) || "Clip";
}

export function byteSize(clip: Clip): string {
  const n = (clip.text ?? clip.preview ?? "").length;
  if (n < 1024) return `${Math.max(n, 1)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** file:// URL per drag&drop verso il SO: text/uri-list vuole lo scheme, non il path nudo. */
export function imageFileUrl(clip: Clip): string | null {
  const p = clip.image_path?.replace(/^asset:\/\/localhost\//, "");
  if (!p) return null;
  return encodeURI(`file://${p.startsWith("/") ? "" : "/"}${p}`);
}

export function imageDimensions(clip: Clip): string | null {
  const m = (clip.preview || clip.text || "").match(/(\d+)\s*[x×]\s*(\d+)/i);
  return m ? `${m[1]} × ${m[2]} px` : null;
}

export function groupClips(clips: Clip[]): { label: string; items: Clip[] }[] {
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  const buckets: { Oggi: Clip[]; Ieri: Clip[]; Precedenti: Clip[] } = {
    Oggi: [],
    Ieri: [],
    Precedenti: [],
  };
  for (const c of clips) {
    const d = new Date(c.created_at);
    if (d >= startToday) buckets.Oggi.push(c);
    else if (d >= startYesterday) buckets.Ieri.push(c);
    else buckets.Precedenti.push(c);
  }
  return (["Oggi", "Ieri", "Precedenti"] as const)
    .filter((k) => buckets[k].length > 0)
    .map((label) => ({ label, items: buckets[label] }));
}
