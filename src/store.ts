import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Category, Clip } from "./types";
import { DEMO_CATEGORIES, DEMO_CLIPS, isTauri } from "./demo";
import { DEFAULT_SETTINGS, parseSearch, type Settings } from "./settings";

type View = "shelf" | "library" | "capture" | "settings";

interface BoardifyState {
  view: View;
  clips: Clip[];
  categories: Category[];
  query: string;
  kindFilter: string;
  categoryFilter: string;
  favOnly: boolean;
  pinnedOnly: boolean;
  selectedId: string | null;
  multiSelect: string[];
  loading: boolean;
  stats: { total: number; favorites: number } | null;
  settings: Settings;
  previewId: string | null;
  noteOpen: boolean;

  setView: (v: View) => void;
  setQuery: (q: string) => void;
  setKind: (k: string) => void;
  setCategory: (c: string) => void;
  setFavOnly: (b: boolean) => void;
  setPinnedOnly: (b: boolean) => void;
  select: (id: string | null) => void;
  setPreview: (id: string | null) => void;
  setNoteOpen: (b: boolean) => void;
  toggleMulti: (id: string) => void;
  clearMulti: () => void;
  patchSettings: (p: Partial<Settings>) => void;
  loadSettings: () => Promise<void>;

  refresh: () => Promise<void>;
  search: () => Promise<void>;
  copyClip: (id: string, hide?: boolean) => Promise<void>;
  toggleFav: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  setShortcut: (id: string, shortcut: string | null) => Promise<void>;
  deleteClip: (id: string) => Promise<void>;
  combineSelected: () => Promise<void>;
  createCategory: (name: string) => Promise<void>;
  insertNote: (text: string) => Promise<void>;
  openLibrary: () => Promise<void>;
  openSettings: () => Promise<void>;
  activateClip: (id: string) => Promise<void>;
}

let debounce: ReturnType<typeof setTimeout> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

async function persistSettings(s: Settings) {
  if (!isTauri()) {
    localStorage.setItem("boardify-settings", JSON.stringify(s));
    return;
  }
  try {
    const { LazyStore } = await import("@tauri-apps/plugin-store");
    const st = new LazyStore("settings.json");
    await st.set("boardify", s);
    await st.save();
    await invoke("apply_watch_settings", {
      autoCapture: s.autoCapture,
      captureToast: s.captureToast,
      ignoredApps: s.ignoredApps
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
      autoDeleteDays: s.autoDeleteDays,
      shortcutsEnabled: s.shortcutsEnabled,
      notchEnabled: s.notchEnabled,
    });
  } catch {
    /* store plugin opzionale in preview */
  }
}

function applyClientFilters(clips: Clip[], get: () => BoardifyState): Clip[] {
  const { kindFilter, categoryFilter, favOnly, pinnedOnly, query } = get();
  const parsed = parseSearch(query);
  let out = clips;
  const kind = parsed.kind ?? (kindFilter === "all" ? undefined : kindFilter);
  if (kind) out = out.filter((c) => c.kind === kind);
  const category = parsed.category ?? (categoryFilter === "all" ? undefined : categoryFilter);
  if (category) out = out.filter((c) => c.categories.includes(category));
  if (favOnly) out = out.filter((c) => c.is_favorite);
  if (pinnedOnly) out = out.filter((c) => c.is_pinned);
  if (parsed.app) {
    const a = parsed.app;
    out = out.filter((c) => c.source_app.toLowerCase().includes(a));
  }
  if (parsed.text) {
    const q = parsed.text.toLowerCase();
    out = out.filter((c) =>
      (c.preview + (c.text ?? "") + (c.ocr_text ?? "") + c.source_app).toLowerCase().includes(q)
    );
  }
  return out;
}

export const useBoardify = create<BoardifyState>((set, get) => ({
  view: (() => {
    const v = new URLSearchParams(location.search).get("view");
    return v === "library" || v === "capture" || v === "shelf" || v === "settings" ? v : "shelf";
  })(),
  clips: [],
  categories: [],
  query: "",
  kindFilter: "all",
  categoryFilter: "all",
  favOnly: false,
  pinnedOnly: false,
  selectedId: null,
  multiSelect: [],
  loading: false,
  stats: null,
  settings: DEFAULT_SETTINGS,
  previewId: null,
  noteOpen: false,

  setView: (view) => set({ view }),
  setQuery: (query) => {
    set({ query });
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => get().search(), 140);
  },
  setKind: (kindFilter) => {
    set({ kindFilter });
    get().refresh();
  },
  setCategory: (categoryFilter) => {
    set({ categoryFilter });
    get().refresh();
  },
  setFavOnly: (favOnly) => {
    set({ favOnly });
    get().refresh();
  },
  setPinnedOnly: (pinnedOnly) => {
    set({ pinnedOnly });
    get().refresh();
  },
  select: (selectedId) => set({ selectedId }),
  setPreview: (previewId) => set({ previewId }),
  setNoteOpen: (noteOpen) => set({ noteOpen }),
  toggleMulti: (id) =>
    set((s) => ({
      multiSelect: s.multiSelect.includes(id)
        ? s.multiSelect.filter((x) => x !== id)
        : [...s.multiSelect, id],
    })),
  clearMulti: () => set({ multiSelect: [] }),
  patchSettings: (p) => {
    const settings = { ...get().settings, ...p };
    set({ settings });
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => persistSettings(settings), 200);
  },
  loadSettings: async () => {
    try {
      if (!isTauri()) {
        const raw = localStorage.getItem("boardify-settings");
        if (raw) set({ settings: { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } });
        return;
      }
      const { LazyStore } = await import("@tauri-apps/plugin-store");
      const st = new LazyStore("settings.json");
      const saved = await st.get<Settings>("boardify");
      if (saved) {
        const settings = { ...DEFAULT_SETTINGS, ...saved };
        set({ settings });
        await persistSettings(settings);
      }
    } catch {
      /* defaults */
    }
  },

  refresh: async () => {
    if (!isTauri()) {
      const clips = applyClientFilters(DEMO_CLIPS, get);
      set((s) => ({
        clips,
        categories: DEMO_CATEGORIES,
        selectedId: s.selectedId && clips.some((c) => c.id === s.selectedId) ? s.selectedId : clips[0]?.id ?? null,
        loading: false,
      }));
      return;
    }
    const { kindFilter, categoryFilter, favOnly, query } = get();
    const parsed = parseSearch(query);
    if (parsed.text) return get().search();
    set({ loading: true });
    try {
      const [clipsRaw, categories] = await Promise.all([
        invoke<Clip[]>("get_clips", {
          limit: 200,
          kind: parsed.kind ?? (kindFilter === "all" ? null : kindFilter),
          category: parsed.category ?? (categoryFilter === "all" ? null : categoryFilter),
          favoritesOnly: favOnly,
        }),
        invoke<Category[]>("get_categories"),
      ]);
      let clips = clipsRaw;
      if (get().pinnedOnly) clips = clips.filter((c) => c.is_pinned);
      if (parsed.app) {
        const a = parsed.app;
        clips = clips.filter((c) => c.source_app.toLowerCase().includes(a));
      }
      set((s) => ({
        clips,
        categories,
        selectedId: s.selectedId && clips.some((c) => c.id === s.selectedId) ? s.selectedId : clips[0]?.id ?? null,
      }));
    } finally {
      set({ loading: false });
    }
  },

  search: async () => {
    if (!isTauri()) return get().refresh();
    const parsed = parseSearch(get().query);
    if (!parsed.text && !parsed.kind && !parsed.category && !parsed.app) return get().refresh();
    set({ loading: true });
    try {
      let clips = parsed.text
        ? await invoke<Clip[]>("search_clips", { query: parsed.text, limit: 200 })
        : await invoke<Clip[]>("get_clips", {
            limit: 200,
            kind: parsed.kind ?? null,
            category: parsed.category ?? null,
            favoritesOnly: false,
          });
      if (parsed.kind) clips = clips.filter((c) => c.kind === parsed.kind);
      if (parsed.category) clips = clips.filter((c) => c.categories.includes(parsed.category!));
      if (parsed.app) clips = clips.filter((c) => c.source_app.toLowerCase().includes(parsed.app!));
      set((s) => ({ clips, selectedId: clips[0]?.id ?? s.selectedId }));
    } finally {
      set({ loading: false });
    }
  },

  copyClip: async (id, hide) => {
    if (isTauri()) await invoke("copy_clip", { id });
    set((s) => ({
      clips: s.clips.map((c) => (c.id === id ? { ...c, copy_count: c.copy_count + 1 } : c)),
    }));
    if (hide && isTauri()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().hide();
    }
  },
  toggleFav: async (id) => {
    const fav = isTauri()
      ? await invoke<boolean>("toggle_favorite", { id })
      : !get().clips.find((c) => c.id === id)?.is_favorite;
    set((s) => ({
      clips: s.clips.map((c) => (c.id === id ? { ...c, is_favorite: fav } : c)),
    }));
  },
  togglePin: async (id) => {
    const pin = isTauri()
      ? await invoke<boolean>("toggle_pin", { id })
      : !get().clips.find((c) => c.id === id)?.is_pinned;
    set((s) => ({
      clips: s.clips.map((c) => (c.id === id ? { ...c, is_pinned: pin } : c)),
    }));
  },
  setShortcut: async (id, shortcut) => {
    const norm = shortcut?.trim().toLowerCase() || null;
    const value = norm ? (norm.startsWith(";") ? norm : `;${norm}`) : null;
    if (isTauri()) await invoke("set_inline_shortcut", { id, shortcut: value });
    set((s) => ({
      clips: s.clips.map((c) => (c.id === id ? { ...c, inline_shortcut: value } : c)),
    }));
  },
  deleteClip: async (id) => {
    if (isTauri()) await invoke("delete_clip", { id });
    set((s) => ({
      clips: s.clips.filter((c) => c.id !== id),
      selectedId: s.selectedId === id ? s.clips[0]?.id ?? null : s.selectedId,
    }));
  },
  combineSelected: async () => {
    const { multiSelect } = get();
    if (multiSelect.length < 2) return;
    if (isTauri()) await invoke("combine_clips", { ids: multiSelect });
    set({ multiSelect: [] });
    await get().refresh();
  },
  createCategory: async (name) => {
    if (!isTauri()) {
      set((s) => ({
        categories: [...s.categories, { id: name, name, color: "#6366f1", count: 0 }],
      }));
      return;
    }
    await invoke("create_category", { name, color: null });
    const categories = await invoke<Category[]>("get_categories");
    set({ categories });
  },
  insertNote: async (text) => {
    if (isTauri()) {
      await invoke("insert_note", { text });
    } else {
      const now = new Date().toISOString();
      const clip: Clip = {
        id: crypto.randomUUID(),
        kind: "text",
        preview: text,
        text,
        source_app: "Boardify",
        window_title: "Quick note",
        hash: text.slice(0, 16),
        is_favorite: false,
        is_sensitive: false,
        copy_count: 0,
        is_pinned: false,
        categories: ["History"],
        created_at: now,
      };
      set((s) => ({ clips: [clip, ...s.clips], noteOpen: false, selectedId: clip.id }));
      return;
    }
    set({ noteOpen: false });
    await get().refresh();
  },
  openLibrary: async () => {
    try {
      await invoke("show_window", { label: "library" });
      await invoke("hide_window", { label: "shelf" });
    } catch {
      set({ view: "library" });
    }
  },
  openSettings: async () => {
    try {
      await invoke("show_window", { label: "settings" });
    } catch {
      set({ view: "settings" });
    }
  },
  activateClip: async (id) => {
    const { settings } = get();
    if (settings.clickAction === "select") {
      set({ selectedId: id });
      return;
    }
    await get().copyClip(id, settings.clickAction === "copy-hide");
  },
}));

export function initRealtime() {
  if (!isTauri()) return;
  listen("clips-changed", () => {
    const { query } = useBoardify.getState();
    if (query.trim()) useBoardify.getState().search();
    else useBoardify.getState().refresh();
  });
  listen("window-shown", () => {
    useBoardify.getState().refresh();
  });
  listen("open-note", () => {
    useBoardify.getState().setNoteOpen(true);
  });
}
