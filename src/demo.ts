import type { Category, Clip } from "./types";

const now = Date.now();
// A self-contained vector sample keeps the image demo available offline.
const demoArtwork = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#9bb8c4"/><stop offset="1" stop-color="#e4dbc2"/></linearGradient><linearGradient id="hill" x2="0" y2="1"><stop stop-color="#688c82"/><stop offset="1" stop-color="#263f40"/></linearGradient></defs><rect width="1280" height="720" fill="url(#sky)"/><circle cx="975" cy="180" r="73" fill="#f6e9c5"/><path d="M0 490Q350 170 720 465T1280 420V720H0Z" fill="#a5b5a0"/><path d="M0 370Q350 700 800 455T1280 510V720H0Z" fill="url(#hill)"/><path d="M350 720Q530 510 700 540T980 470Q750 650 750 720Z" fill="#c6bc93"/><text x="75" y="120" font-family="sans-serif" font-size="22" fill="#31464b" letter-spacing="7">A LITTLE ROOM TO THINK.</text></svg>`;

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
    preview: "Le idee migliori meritano un posto.\nRaccogli, ritrova e riparti da qui.",
    source_app: "chrome",
    created_at: new Date(now - 23 * 60_000).toISOString(),
  }),
  clip({
    id: "3",
    kind: "text",
    preview: "Studio creativo\nVia della Moscova, 18\n20121 Milano",
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
    text: `data:image/svg+xml;utf8,${encodeURIComponent(demoArtwork)}`,
    source_app: "firefox",
    created_at: new Date(now - 5 * 60_000).toISOString(),
    categories: ["History", "Assets"],
  }),
];

// Mock pesante per i test di fluidità: `?heavy=300` aggiunge N clip sintetiche
// deterministiche (seed fisso) mescolando kind e lunghezze. Solo dev/test,
// produzione e screenshot non lo usano.
function heavyCount(): number {
  try {
    const n = Number(new URLSearchParams(location.search).get("heavy"));
    return Number.isFinite(n) && n > 0 ? Math.min(2000, Math.floor(n)) : 0;
  } catch {
    return 0;
  }
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HEAVY_WORDS = "boardify appunto rapido idea snippet link colore screenshot nota progetto revisione testo codice".split(" ");

function genHeavyClips(n: number): Clip[] {
  const rnd = mulberry32(42);
  const apps = ["firefox", "chrome", "code", "figma", "thunderbird", "slack"];
  const kinds = ["text", "text", "text", "link", "code", "color", "link", "text", "image"] as const;
  const out: Clip[] = [];
  for (let i = 0; i < n; i++) {
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    const words = Array.from({ length: 4 + Math.floor(rnd() * 24) }, () => HEAVY_WORDS[Math.floor(rnd() * HEAVY_WORDS.length)]);
    const stamp = `heavy-${i} ${words.join(" ")}`;
    const created = new Date(now - Math.floor(rnd() * 9 * 24 * 60) * 60_000).toISOString();
    const base = {
      id: `heavy-${i}`,
      source_app: apps[Math.floor(rnd() * apps.length)],
      created_at: created,
      hash: `heavy-${i}`,
    };
    if (kind === "link") {
      const url = `https://example.test/articoli/${i}-${words[0]}`;
      out.push(clip({ ...base, kind, preview: `${words.slice(0, 6).join(" ")}`, text: url, categories: ["History", "Link"] }));
    } else if (kind === "code") {
      const code = `function heavy${i}(${words[0]}: string) {\n  return ${words[1]} ?? "${words[2]}";\n}`;
      out.push(clip({ ...base, kind, preview: code, text: code, categories: ["History", "Snippet"] }));
    } else if (kind === "color") {
      const hex = `#${Math.floor(rnd() * 0xffffff).toString(16).padStart(6, "0").toUpperCase()}`;
      out.push(clip({ ...base, kind, preview: hex, text: hex, color_hex: hex, categories: ["History", "Colors"] }));
    } else if (kind === "image") {
      const art = `data:image/svg+xml;utf8,${encodeURIComponent(demoArtwork)}`;
      out.push(clip({ ...base, kind, preview: `[Imm heavy ${i}]`, text: art, categories: ["History", "Assets"] }));
    } else {
      out.push(clip({ ...base, kind: "text", preview: stamp, categories: ["History"] }));
    }
  }
  return out;
}

const _heavy = genHeavyClips(heavyCount());
if (_heavy.length) DEMO_CLIPS.push(..._heavy);

export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}
