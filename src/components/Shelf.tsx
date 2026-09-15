import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Search, Star, LayoutGrid, Pin, Settings2, StickyNote, X, Menu } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { useBoardify } from "../store";
import { ClipCard } from "./ClipCard";
import { ClipPreview } from "./ClipPreview";
import { CategoryPills } from "./CategoryPills";
import { groupClips } from "../types";
import { KINDS } from "../settings";
import { isTauri } from "../demo";
import { shelfVariants, spring } from "../motion";

export function Shelf() {
  const s = useBoardify();
  const inputRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const live = useRef(s);
  live.current = s;
  const [tick, setTick] = useState(0);
  const [note, setNote] = useState("");
  const reduce = useReducedMotion();

  useEffect(() => {
    s.refresh();
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      const st = live.current;
      if (st.noteOpen) {
        if (e.key === "Escape") st.setNoteOpen(false);
        return;
      }
      if (e.key === "Escape") {
        if (st.previewId) st.setPreview(null);
        else if (isTauri()) getCurrentWindow().hide();
      }
      if (e.key === " " && !e.repeat && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        const id = st.selectedId ?? st.clips[0]?.id;
        if (id) st.setPreview(st.previewId === id ? null : id);
      }
      if (e.key === "Enter" && !e.shiftKey && document.activeElement?.tagName !== "TEXTAREA") {
        const id = st.selectedId ?? st.clips[0]?.id;
        if (id) st.activateClip(id);
      }
      if (e.key === "n" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        st.setNoteOpen(true);
        setTimeout(() => noteRef.current?.focus(), 40);
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const i = Math.max(0, st.clips.findIndex((c) => c.id === st.selectedId));
        const next = e.key === "ArrowRight" ? Math.min(st.clips.length - 1, i + 1) : Math.max(0, i - 1);
        if (st.clips[next]) st.select(st.clips[next].id);
      }
    };
    window.addEventListener("keydown", onKey);
    const un = isTauri()
      ? listen("window-shown", () => {
          setTick((n) => n + 1);
          live.current.refresh();
          live.current.setPreview(null);
          setTimeout(() => inputRef.current?.focus(), 40);
        })
      : Promise.resolve(() => {});
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      un.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = groupClips(s.clips.slice(0, 36));
  let running = 0;
  const preview = s.clips.find((c) => c.id === s.previewId) ?? null;

  const stop: { onMouseDown: (e: MouseEvent) => void } = {
    onMouseDown: (e) => e.stopPropagation(),
  };

  return (
    <div className="flex flex-col items-center w-full pointer-events-none">
      <motion.div
        key={tick}
        variants={reduce ? undefined : shelfVariants}
        initial={reduce ? false : "hidden"}
        animate="shown"
        transition={spring}
        className="glass gpu pointer-events-auto w-[1040px] max-w-[96vw] rounded-[28px] overflow-hidden select-none relative"
        data-tauri-drag-region
        {...stop}
      >
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
          <IconBtn
            title="Collection"
            active={s.settings.showCollections}
            onClick={() => s.patchSettings({ showCollections: !s.settings.showCollections })}
          >
            <Menu className="w-4 h-4" />
          </IconBtn>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Search className="w-[15px] h-[15px] text-zinc-500 shrink-0" />
            <input
              ref={inputRef}
              value={s.query}
              onChange={(e) => s.setQuery(e.target.value)}
              placeholder="Search…"
              className="bg-transparent outline-none flex-1 text-[13.5px] placeholder:text-zinc-500"
            />
            {s.query && (
              <button onClick={() => s.setQuery("")} className="text-zinc-500 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <IconBtn active={s.favOnly} title="Preferiti" onClick={() => s.setFavOnly(!s.favOnly)}>
              <Star className={`w-4 h-4 ${s.favOnly ? "fill-current" : ""}`} />
            </IconBtn>
            <IconBtn active={s.pinnedOnly} title="Fissati" onClick={() => s.setPinnedOnly(!s.pinnedOnly)}>
              <Pin className={`w-4 h-4 ${s.pinnedOnly ? "fill-current" : ""}`} />
            </IconBtn>
            <IconBtn title="Quick note" onClick={() => s.setNoteOpen(true)}>
              <StickyNote className="w-4 h-4" />
            </IconBtn>
            <IconBtn title="Libreria  (Ctrl+Shift+L)" onClick={s.openLibrary}>
              <LayoutGrid className="w-4 h-4" />
            </IconBtn>
            <IconBtn title="Impostazioni" onClick={s.openSettings}>
              <Settings2 className="w-4 h-4" />
            </IconBtn>
          </div>
        </div>

        {s.settings.showCollections && (
          <div className="px-4 pb-2.5">
            <CategoryPills
              layoutId="shelf-pill"
              categories={s.categories}
              active={s.categoryFilter}
              onSelect={s.setCategory}
              onCreate={s.createCategory}
            />
          </div>
        )}
        {s.settings.showFilters && (
          <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto no-scrollbar">
            {KINDS.map((k) => (
              <button
                key={k.id}
                onClick={() => s.setKind(k.id)}
                className={`shrink-0 px-3 py-1 rounded-full text-[12px] ${
                  s.kindFilter === k.id ? "bg-white text-black" : "text-zinc-400 hover:text-white"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}

        <div className="px-4 pb-4">
          {s.clips.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-9 text-center">
              <p className="text-[15px] font-semibold tracking-tight">Copia qualcosa e apparirà qui</p>
              <p className="text-[12.5px] text-zinc-500 mt-1">Click su un link = preview · Invio = copia</p>
            </motion.div>
          ) : (
            <div className="flex flex-col gap-2">
              {groups.map((g) => {
                const start = running;
                running += g.items.length;
                return (
                  <div key={g.label}>
                    {groups.length > 1 && (
                      <p className="text-[10.5px] text-zinc-500 px-0.5 mb-1.5 font-medium">{g.label}</p>
                    )}
                    <motion.div layout className="flex gap-2.5 overflow-x-auto no-scrollbar py-0.5">
                      <AnimatePresence mode="popLayout" initial={false}>
                        {g.items.map((clip, i) => (
                          <ClipCard
                            key={clip.id}
                            clip={clip}
                            index={start + i}
                            selected={clip.id === s.selectedId}
                            variant="shelf"
                          />
                        ))}
                      </AnimatePresence>
                    </motion.div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <AnimatePresence>
          {s.noteOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/55 flex items-center justify-center p-5 z-20"
              onClick={() => s.setNoteOpen(false)}
            >
              <motion.div
                initial={{ y: 10, scale: 0.98 }}
                animate={{ y: 0, scale: 1 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-[420px] rounded-2xl bg-[#16161a] ring-1 ring-white/10 p-4"
              >
                <p className="font-medium mb-2">Quick note</p>
                <textarea
                  ref={noteRef}
                  autoFocus
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && note.trim()) {
                      s.insertNote(note.trim());
                      setNote("");
                    }
                  }}
                  rows={5}
                  placeholder="Scrivi e premi Ctrl+Invio…"
                  className="w-full bg-white/[0.05] rounded-xl px-3 py-2 text-[13px] outline-none ring-1 ring-white/10 resize-none"
                />
                <div className="flex justify-end gap-2 mt-3">
                  <button onClick={() => s.setNoteOpen(false)} className="text-[12.5px] text-zinc-400">
                    Annulla
                  </button>
                  <button
                    onClick={() => {
                      if (note.trim()) {
                        s.insertNote(note.trim());
                        setNote("");
                      }
                    }}
                    className="px-3 py-1.5 rounded-full bg-white text-black text-[12.5px] font-semibold"
                  >
                    Salva
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="pointer-events-auto">
        <AnimatePresence>
          {preview && <ClipPreview key={preview.id} clip={preview} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: ReactNode;
  onClick?: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <motion.button
      title={title}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className={`w-8 h-8 rounded-full grid place-items-center transition-colors
        ${active ? "bg-white text-black" : "text-zinc-400 hover:text-white hover:bg-white/[0.08]"}`}
    >
      {children}
    </motion.button>
  );
}
