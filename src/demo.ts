import type { Category, Clip } from "./types";

const now = Date.now();

function clip(partial: Partial<Clip> & Pick<Clip, "id" | "kind" | "preview">): Clip {
  return {
    text: partial.preview,
    source_app: "Firefox",
    window_title: "",
    hash: partial.id,
    is_favorite: false,
    is_sensitive: false,
    copy_count: 1,
    is_pinned: false,
    categories: ["History"],
    created_at: new Date(now - 60_000).toISOString(),
    ...partial,
  };
}

// Stessa tassonomia del backend (src-tauri/src/db.rs).
// Le pill con count 0 sono nascoste da CategoryPills: in dev si vedono tutte,
// nell'uso reale compaiono solo quando copi qualcosa di quel tipo.
export const DEMO_CATEGORIES: Category[] = [
  { id: "h", name: "History", color: "#8b8b8b", count: 8 },
  { id: "s", name: "Snippet", color: "#10b981", count: 1 },
  { id: "l", name: "Link", color: "#a855f7", count: 1 },
  { id: "q", name: "QR Code", color: "#06b6d4", count: 1 },
  { id: "e", name: "Email", color: "#ec4899", count: 1 },
  { id: "t", name: "Template", color: "#eab308", count: 1 },
  { id: "v", name: "Video", color: "#ef4444", count: 1 },
  { id: "c", name: "Colors", color: "#3b82f6", count: 1 },
  { id: "a", name: "Assets", color: "#f59e0b", count: 1 },
];

export const DEMO_CLIPS: Clip[] = [
  clip({
    id: "1",
    kind: "link",
    preview: "Cooldock – A Smart Second Dock with Live Widgets",
    text: "https://www.youtube.com/watch?v=FMldm8ssH0o",
    source_app: "firefox",
    created_at: new Date(now - 26 * 60_000).toISOString(),
    categories: ["History", "Link", "QR Code", "Video"],
  }),
  clip({
    id: "2",
    kind: "text",
    preview: "A curated shelf of beautifully designed macOS apps.",
    source_app: "chrome",
    created_at: new Date(now - 23 * 60_000).toISOString(),
  }),
  clip({
    id: "3",
    kind: "text",
    preview: "Minneapolis 55410,\n2941 Rocket Drive\nUnited States",
    source_app: "firefox",
    created_at: new Date(now - 19 * 60_000).toISOString(),
  }),
  clip({
    id: "4",
    kind: "color",
    preview: "#00B0FF",
    text: "#00B0FF",
    color_hex: "#00B0FF",
    source_app: "figma",
    created_at: new Date(now - 35 * 60_000).toISOString(),
    categories: ["History", "Colors"],
  }),
  clip({
    id: "5",
    kind: "code",
    preview: "fn main() {\n  println!(\"boardify\");\n}",
    text: "fn main() {\n  println!(\"boardify\");\n}",
    source_app: "code",
    created_at: new Date(now - 11 * 60 * 60_000).toISOString(),
    categories: ["History", "Snippet"],
  }),
  clip({
    id: "6",
    kind: "text",
    preview: "scrivi a mario.rossi@example.it per il preventivo",
    source_app: "thunderbird",
    created_at: new Date(now - 9 * 60 * 60_000).toISOString(),
    categories: ["History", "Email"],
  }),
  clip({
    id: "7",
    kind: "text",
    preview: "Ciao {{nome}},\nla fattura [NUMERO] è pronta. Grazie!",
    source_app: "firefox",
    created_at: new Date(now - 8 * 60 * 60_000).toISOString(),
    categories: ["History", "Template"],
  }),
  clip({
    id: "8",
    kind: "image",
    preview: "[Immagine 1280 × 720]",
    text: "[Immagine 1280 × 720]",
    source_app: "firefox",
    created_at: new Date(now - 5 * 60_000).toISOString(),
    categories: ["History", "Assets"],
  }),
];

export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}
