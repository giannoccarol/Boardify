import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { motion, AnimatePresence, useAnimationControls, useReducedMotion } from "framer-motion";
import { Search, Star, LayoutGrid, Pin, Settings2, StickyNote, X, Menu } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useBoardify } from "../store";
import { Brand } from "./Brand";
import { ActionGlyph } from "./ActionGlyph";
import { ClipCard } from "./ClipCard";
import { ClipPreview } from "./ClipPreview";
import { CategoryPills } from "./CategoryPills";
import { ReminderDialog, ReminderDueBanner, ReminderStrip } from "./Reminders";
import { groupClips, type Clip } from "../types";
import { useShelfScroll } from "../useShelfScroll";
import { KIND_IDS } from "../settings";
import { useT } from "../i18n";
import { isTauri } from "../demo";
import { closeShelf, registerShelfClose } from "../shelfWindow";
import { shelfVariants, shelfSeedVariants, shelfContentVariants, shelfGleamVariants, spring } from "../motion";

export function Shelf() {
  const s = useBoardify();
  const { t, locale } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const live = useRef(s);
  live.current = s;
  const [tick, setTick] = useState(0);
  const [note, setNote] = useState("");
  const reduce = useReducedMotion();
  const entrance = useAnimationControls();
  const playback = useRef(0);
  const closeTask = useRef<Promise<void> | null>(null);
  const [phase, setPhase] = useState<"opening" | "open" | "closing" | "closed">("opening");

  const close = useRef<(generation?: number) => Promise<void>>(async () => {});
  close.current = (generation) => {
    if (closeTask.current) return closeTask.current;
    const current = ++playback.current;
    entrance.stop();
    setPhase("closing");
    live.current.setPreview(null);
    live.current.setNoteOpen(false);
    const task = (async () => {
      if (reduce) entrance.set("hidden");
      else {
        await entrance.start("collapse");
        if (playback.current !== current) return;
        await entrance.start("exit");
      }
      if (playback.current !== current) return;
      setPhase("closed");
      if (isTauri() && generation !== undefined) {
        await invoke("finish_shelf_close", { generation });
      }
    })();
    closeTask.current = task;
    return task;
  };

  useLayoutEffect(() => {
    // La finestra Tauri resta montata mentre è nascosta. Ripartiamo ad ogni
    // window-shown senza rimontare card, input e contenitori con lo scroll.
    entrance.stop();
    const current = ++playback.current;
    closeTask.current = null;
    if (reduce) {
      entrance.set("shown");
      setPhase("open");
      return;
    }
    setPhase("opening");
    entrance.set("hidden");
    void entrance.start("emerge").then(async () => {
      if (playback.current !== current) return;
      await entrance.start("shown");
      if (playback.current === current) setPhase("open");
    });
    return () => {
      ++playback.current;
      entrance.stop();
    };
  }, [entrance, reduce, tick]);

  useEffect(() => {
    s.refresh();
    s.loadReminders();
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (closeTask.current) return;
      const st = live.current;
      if (st.noteOpen) {
        if (e.key === "Escape") st.setNoteOpen(false);
        return;
      }
      if (e.key === "Escape") {
        if (st.previewId) st.setPreview(null);
        else void closeShelf();
      }
      if (e.key === " " && !e.repeat && !["INPUT", "TEXTAREA", "BUTTON"].includes(document.activeElement?.tagName ?? "")) {
        e.preventDefault();
        const id = st.selectedId ?? st.clips[0]?.id;
        if (id) st.setPreview(st.previewId === id ? null : id);
      }
      if (e.key === "Enter" && !e.shiftKey && !["TEXTAREA", "BUTTON"].includes(document.activeElement?.tagName ?? "")) {
        const id = st.selectedId ?? st.clips[0]?.id;
        if (id) st.activateClip(id);
      }
      if ((e.key === "n" || e.key === "N") && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        st.setNoteOpen(true);
        setTimeout(() => noteRef.current?.focus(), 40);
      }
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        const last = Math.min(st.clips.length, 36) - 1;
        const i = Math.min(last, Math.max(0, st.clips.findIndex((c) => c.id === st.selectedId)));
        const next = e.key === "ArrowRight" ? Math.min(last, i + 1) : Math.max(0, i - 1);
        if (st.clips[next]) {
          st.select(st.clips[next].id);
          // Se la preview è aperta la trascina dietro: il pannello sotto switcha clip.
          if (st.previewId) st.setPreview(st.clips[next].id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    const unregisterClose = registerShelfClose(() => close.current());
    const un = isTauri()
      ? Promise.all([listen("window-shown", () => {
          setTick((n) => n + 1);
          live.current.refresh();
          live.current.loadReminders();
          live.current.setPreview(null);
          setTimeout(() => inputRef.current?.focus(), 40);
        }), listen<number>("shelf-close-requested", ({ payload }) => {
          void close.current(payload);
        })])
      : Promise.resolve([]);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      unregisterClose();
      un.then((listeners) => listeners.forEach((f) => f()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = groupClips(s.clips.slice(0, 36), locale);
  let running = 0;
  const preview = s.clips.find((c) => c.id === s.previewId) ?? null;

  const stop: { onMouseDown: (e: MouseEvent) => void } = {
    onMouseDown: (e) => e.stopPropagation(),
  };

  return (
    <div className="relative flex flex-col items-center w-full pointer-events-none" inert={phase === "closing" || phase === "closed"}>
      {!reduce && (
        <motion.div
          aria-hidden="true"
          className="shelf-seed glass gpu"
          variants={shelfSeedVariants}
          initial="hidden"
          animate={entrance}
        />
      )}
      <motion.div
        variants={shelfVariants}
        initial={reduce ? false : "hidden"}
        animate={entrance}
        exit="exit"
        data-state={phase}
        className="shelf-window glass gpu pointer-events-auto w-[1040px] max-w-[96vw] overflow-hidden select-none relative"
        {...stop}
      >
        {!reduce && (
          <motion.div aria-hidden="true" className="shelf-gleam gpu" variants={shelfGleamVariants} />
        )}
        <motion.div className="shelf-reveal gpu" variants={shelfContentVariants}>
        <div className="shelf-toolbar" data-tauri-drag-region>

          <Brand compact />
          <IconBtn
            title={t("shelf.collections")}
            active={s.settings.showCollections}
            onClick={() => s.patchSettings({ showCollections: !s.settings.showCollections })}
          >
            <Menu className="w-4 h-4" />
          </IconBtn>
          <div className="shelf-search flex items-center gap-2 flex-1 min-w-0">
            <Search className="w-[15px] h-[15px] text-zinc-500 shrink-0" />
            <input
              ref={inputRef}
              value={s.query}
              onChange={(e) => s.setQuery(e.target.value)}
              placeholder={t("shelf.searchPlaceholder")}
              aria-label={t("shelf.searchAria")}
              data-tauri-drag-region="false"
              className="bg-transparent outline-none flex-1 min-w-0 text-[13px] placeholder:text-zinc-500"
            />
            {s.query && (
              <button onClick={() => s.setQuery("")} className="text-zinc-500 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <IconBtn active={s.favOnly} title={t("shelf.favorites")} onClick={() => s.setFavOnly(!s.favOnly)}>
              <Star className={`w-4 h-4 ${s.favOnly ? "fill-current" : ""}`} />
            </IconBtn>
            <IconBtn active={s.pinnedOnly} title={t("shelf.pinned")} onClick={() => s.setPinnedOnly(!s.pinnedOnly)}>
              <Pin className={`w-4 h-4 ${s.pinnedOnly ? "fill-current" : ""}`} />
            </IconBtn>
            <IconBtn title={t("shelf.newNote")} onClick={() => s.setNoteOpen(true)}>
              <StickyNote className="w-4 h-4" />
            </IconBtn>
            <IconBtn title={t("shelf.library")} onClick={s.openLibrary}>
              <LayoutGrid className="w-4 h-4" />
            </IconBtn>
            <IconBtn title={t("shelf.settings")} onClick={s.openSettings}>
              <Settings2 className="w-4 h-4" />
            </IconBtn>
          </div>
        </div>

        {s.settings.showCollections && (
          <div className="shelf-collections">
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
            {KIND_IDS.map((id) => (
              <button
                key={id}
                onClick={() => s.setKind(id)}
                className={`shrink-0 px-3 py-1 rounded-full text-[12px] ${
                  s.kindFilter === id ? "bg-white text-black" : "text-zinc-400 hover:text-white"
                }`}
              >
                {t(`kind.${id}` as const)}
              </button>
            ))}
          </div>
        )}

        <div className="shelf-content" data-tauri-drag-region="false">
          <ReminderDueBanner />
          <ReminderStrip />
          {s.clips.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-9 text-center">
              <p className="text-[15px] font-semibold tracking-tight">{t("shelf.emptyTitle")}</p>
              <p className="text-[12.5px] text-zinc-500 mt-1">{t("shelf.emptyHint")}</p>
            </motion.div>
          ) : (
            <div className="flex flex-col gap-2">
              {groups.map((g) => {
                const start = running;
                running += g.items.length;
                return (
                  <div key={g.label}>
                    {groups.length > 1 && (
                      <p className="shelf-date">{g.label}</p>
                    )}
                    <ShelfRail clips={g.items} start={start} selectedId={s.selectedId} enabled={phase === "open"} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="shelf-footer"><span><span className="status-dot" /> {s.clips.length === 1 ? t("shelf.footerCountOne") : t("shelf.footerCount", { count: s.clips.length })}</span><span><kbd>{t("kbd.space")}</kbd> {t("shelf.footerPreview")} <kbd>{t("kbd.enter")}</kbd> {t("shelf.footerCopy")}</span></div>
        </motion.div>
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
                transition={spring}
                className="glass gpu w-full max-w-[420px] rounded-2xl p-4"
              >
                <p className="font-medium mb-2">{t("shelf.noteTitle")}</p>
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
                  placeholder={t("shelf.notePlaceholder")}
                  className="w-full bg-white/[0.05] rounded-xl px-3 py-2 text-[13px] outline-none ring-1 ring-white/10 resize-none"
                />
                <div className="flex justify-end gap-2 mt-3">
                  <button onClick={() => s.setNoteOpen(false)} className="text-[12.5px] text-zinc-400">
                    {t("action.cancel")}
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
                    {t("action.save")}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <ReminderDialog />
      </motion.div>

      <div className="pointer-events-auto">
        <AnimatePresence>
          {preview && <ClipPreview key="clip-preview" clip={preview} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ShelfRail({ clips, start, selectedId, enabled }: {
  clips: Clip[];
  start: number;
  selectedId: string | null;
  enabled: boolean;
}) {
  const ref = useShelfScroll(selectedId, enabled);
  return (
    <motion.div ref={ref} layout layoutScroll className="shelf-rail flex gap-2.5 overflow-x-auto no-scrollbar py-0.5">
      <AnimatePresence mode="popLayout" initial={false}>
        {clips.map((clip, i) => (
          <ClipCard key={clip.id} clip={clip} index={start + i} selected={clip.id === selectedId} variant="shelf" />
        ))}
      </AnimatePresence>
    </motion.div>
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
  const reduce = useReducedMotion();
  return (
    <motion.button
      title={title}
      aria-label={title}
      aria-pressed={active}
      whileTap={reduce ? undefined : { scale: 0.9 }}
      onClick={onClick}
      data-tauri-drag-region="false"
      className={`w-8 h-8 rounded-[10px] grid place-items-center
        ${active ? "bg-white text-black" : "text-zinc-400 hover:text-white hover:bg-white/[0.08]"}`}
    >
      <ActionGlyph active={active}>{children}</ActionGlyph>
    </motion.button>
  );
}
