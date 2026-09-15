import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Search, Star, Trash2, Copy, X, ShieldAlert, Pin, LayoutGrid, List, Columns3, Settings2 } from "lucide-react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useBoardify } from "../store";
import { ClipCard } from "./ClipCard";
import { CategoryPills } from "./CategoryPills";
import { AppBadge } from "./AppBadge";
import { byteSize, imageDimensions, imageFileUrl, prettyApp, timeAgo } from "../types";
import { formatCopy } from "../settings";
import { isTauri } from "../demo";
import { snappy, soft } from "../motion";
import { clipColor, isDataImage, isSvgMarkup, parseGradientCss } from "../color";
import { normalizeShortcut } from "../smartActions";

export function Library() {
  const s = useBoardify();
  const reduce = useReducedMotion();

  useEffect(() => {
    s.refresh();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") getCurrentWindow().hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => s.clips.find((c) => c.id === s.selectedId) ?? s.clips[0] ?? null,
    [s.clips, s.selectedId]
  );

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.98, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={soft}
      className="glass gpu w-full h-full rounded-[22px] overflow-hidden flex select-none"
    >
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-3 px-5 pt-4 pb-2" data-tauri-drag-region>
          <div className="flex items-center gap-2 w-[260px] bg-white/[0.06] rounded-full px-3.5 py-1.5 ring-1 ring-white/10">
            <Search className="w-4 h-4 text-zinc-500" />
            <input
              value={s.query}
              onChange={(e) => s.setQuery(e.target.value)}
              placeholder="Search…  @video  @email  @code"
              className="bg-transparent outline-none flex-1 text-[13.5px] placeholder:text-zinc-600"
            />
          </div>
          <div className="ml-auto flex items-center gap-1">
            {(["card", "list", "board"] as const).map((v) => (
              <button
                key={v}
                title={v}
                onClick={() => s.patchSettings({ libraryView: v })}
                className={`w-8 h-8 rounded-full grid place-items-center ${
                  s.settings.libraryView === v ? "bg-white text-black" : "text-zinc-400 hover:text-white"
                }`}
              >
                {v === "card" ? <LayoutGrid className="w-4 h-4" /> : v === "list" ? <List className="w-4 h-4" /> : <Columns3 className="w-4 h-4" />}
              </button>
            ))}
            <button
              title="Impostazioni"
              onClick={s.openSettings}
              className="w-8 h-8 rounded-full grid place-items-center text-zinc-400 hover:text-white"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        {s.settings.showCollections && (
        <div className="px-4 pb-3">
          <CategoryPills
            layoutId="lib-pill"
            categories={s.categories}
            active={s.categoryFilter}
            onSelect={s.setCategory}
            onCreate={s.createCategory}
          />
        </div>
        )}
        <div className="flex-1 overflow-y-auto nice-scroll px-5 pb-5">
          {s.settings.libraryView === "board" ? (
            <div className="flex gap-3 overflow-x-auto no-scrollbar h-full items-start">
              {s.categories
                .filter((c) => c.name !== "History" && c.count > 0)
                .map((col) => (
                  <div key={col.id} className="w-[200px] shrink-0">
                    <p className="text-[12px] font-medium text-zinc-400 mb-2 px-1">
                      {col.name}{" "}
                      <span className="text-zinc-600">{s.clips.filter((c) => c.categories.includes(col.name)).length}</span>
                    </p>
                    <div className="space-y-2">
                      {s.clips
                        .filter((c) => c.categories.includes(col.name))
                        .map((clip, i) => (
                          <ClipCard key={clip.id} clip={clip} index={i} selected={clip.id === selected?.id} variant="grid" />
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          ) : s.settings.libraryView === "list" ? (
            <div className="space-y-1">
              {s.clips.map((clip, i) => (
                <ClipCard key={clip.id} clip={clip} index={i} selected={clip.id === selected?.id} variant="list" />
              ))}
            </div>
          ) : (
          <div className="flex flex-wrap gap-3">
            <AnimatePresence mode="popLayout" initial={false}>
              {s.clips.map((clip, i) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  index={i}
                  selected={clip.id === selected?.id}
                  variant="grid"
                />
              ))}
            </AnimatePresence>
          </div>
          )}
          {s.clips.length === 0 && (
            <div className="py-20 text-center text-zinc-500">
              <p className="text-[15px] font-semibold text-zinc-300">Nessun risultato</p>
              <p className="text-[12.5px] mt-1">Copia qualcosa — comparirà qui in un attimo.</p>
            </div>
          )}
        </div>
      </div>

      <div className="w-[312px] shrink-0 border-l border-white/[0.07] bg-[#111113] flex flex-col">
        <AnimatePresence mode="wait" initial={false}>
          {selected ? (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10, transition: { duration: 0.12 } }}
              transition={snappy}
              className="flex flex-col h-full"
            >
              <div className="flex items-center gap-2 px-4 py-3">
                <p className="text-[13px] font-medium text-zinc-300 truncate flex-1">
                  {selected.categories[0] ?? "History"}
                </p>
                <HeaderIcon
                  title="Fissa"
                  active={!!selected.is_pinned}
                  onClick={() => s.togglePin(selected.id)}
                >
                  <Pin className={`w-4 h-4 ${selected.is_pinned ? "fill-current" : ""}`} />
                </HeaderIcon>
                <HeaderIcon
                  title="Preferito"
                  active={selected.is_favorite}
                  onClick={() => s.toggleFav(selected.id)}
                >
                  <Star className={`w-4 h-4 ${selected.is_favorite ? "fill-current" : ""}`} />
                </HeaderIcon>
                <HeaderIcon title="Elimina" onClick={() => s.deleteClip(selected.id)}>
                  <Trash2 className="w-4 h-4" />
                </HeaderIcon>
                <HeaderIcon title="Chiudi" onClick={() => getCurrentWindow().hide()}>
                  <X className="w-4 h-4" />
                </HeaderIcon>
              </div>
              <div className="px-4">
                {clipColor(selected) ? (
                  <div
                    className="h-44 rounded-2xl ring-1 ring-white/10"
                    style={{ background: clipColor(selected)! }}
                  />
                ) : parseGradientCss(selected.text) || parseGradientCss(selected.preview) ? (
                  <div
                    className="h-44 rounded-2xl ring-1 ring-white/10"
                    style={{ backgroundImage: parseGradientCss(selected.text) ?? parseGradientCss(selected.preview)! }}
                  />
                ) : isSvgMarkup(selected.text) || isSvgMarkup(selected.preview) ? (
                  <div className="h-44 rounded-2xl ring-1 ring-white/10 bg-[#111] grid place-items-center p-4">
                    <img
                      src={`data:image/svg+xml;utf8,${encodeURIComponent((selected.text ?? selected.preview).trim())}`}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : isDataImage(selected.text) || isDataImage(selected.preview) ? (
                  <img
                    src={(selected.text ?? selected.preview).trim()}
                    alt=""
                    className="w-full max-h-52 object-cover rounded-2xl ring-1 ring-white/10 bg-[#111]"
                  />
                ) : selected.kind === "image" && selected.image_path ? (
                  <img
                    src={convertFileSrc(selected.image_path)}
                    alt=""
                    draggable
                    onDragStart={(e) => {
                      const url = imageFileUrl(selected);
                      if (url) e.dataTransfer.setData("text/uri-list", url + "\r\n");
                      if (isTauri()) getCurrentWindow().setIgnoreCursorEvents(true).catch(() => {});
                    }}
                    onDragEnd={() => {
                      if (isTauri()) getCurrentWindow().setIgnoreCursorEvents(false).catch(() => {});
                    }}
                    className="w-full max-h-52 object-cover rounded-2xl ring-1 ring-white/10 bg-[#111] cursor-grab"
                  />
                ) : (
                  <div className="max-h-52 overflow-y-auto nice-scroll bg-white/[0.04] rounded-2xl p-3.5 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words ring-1 ring-white/10">
                    {selected.text ?? selected.preview}
                  </div>
                )}
              </div>
              <div className="px-5 py-4 space-y-3.5 text-[12.5px] flex-1 overflow-y-auto nice-scroll">
                <Meta label="Created" value={`${new Date(selected.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · ${timeAgo(selected.created_at)}`} />
                <div>
                  <p className="text-zinc-500 uppercase tracking-[0.14em] text-[10px] font-semibold">Source</p>
                  <p className="text-zinc-100 mt-1 flex items-center gap-2">
                    <AppBadge name={selected.source_app} icon={selected.source_icon} size={18} />
                    {prettyApp(selected.source_app)}
                  </p>
                </div>
                {imageDimensions(selected) && (
                  <Meta label="Dimensions" value={imageDimensions(selected)!} />
                )}
                <Meta label="Details" value={byteSize(selected)} />
                <SnippetRow key={`snip-${selected.id}`} clipId={selected.id} current={selected.inline_shortcut ?? null} />
                {selected.is_sensitive && (
                  <p className="flex items-center gap-1.5 text-amber-400 text-[12px]">
                    <ShieldAlert className="w-3.5 h-3.5" /> Contenuto sensibile
                  </p>
                )}
                {s.categories.filter((c) => c.name !== "History").length > 0 && (
                  <div>
                    <p className="text-zinc-500 uppercase tracking-[0.14em] text-[10px] font-semibold mb-1.5">
                      Categorie
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {s.categories
                        .filter((c) => c.name !== "History")
                        .map((c) => {
                          const on = selected.categories.includes(c.name);
                          return (
                            <button
                              key={c.id}
                              onClick={() =>
                                invoke("assign_category", {
                                  clipId: selected.id,
                                  categoryId: c.id,
                                  assign: !on,
                                }).then(() => s.refresh())
                              }
                              className={`px-2.5 py-1 rounded-full text-[11.5px] ring-1 ${
                                on
                                  ? "bg-white text-black ring-white"
                                  : "bg-white/[0.05] text-zinc-400 ring-white/10 hover:text-white"
                              }`}
                            >
                              {c.name}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {(["plain", "upper", "lower", "cap"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={async () => {
                        const t = formatCopy(selected.text ?? selected.preview, mode);
                        if (isTauri()) {
                          const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
                          await writeText(t);
                        }
                      }}
                      className="px-2 py-1 rounded-full text-[11px] bg-white/[0.06] text-zinc-400 hover:text-white"
                    >
                      {mode === "plain" ? "Plain" : mode === "upper" ? "ABC" : mode === "lower" ? "abc" : "Abc"}
                    </button>
                  ))}
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => s.copyClip(selected.id)}
                  className="w-full flex items-center justify-center gap-2 bg-white text-black font-semibold rounded-2xl py-2.5 text-[13.5px] hover:bg-zinc-200"
                >
                  <Copy className="w-4 h-4" /> Copy to clipboard
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="m-auto text-zinc-600 text-[13px]"
            >
              Seleziona un clip
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function SnippetRow({ clipId, current }: { clipId: string; current: string | null }) {
  const s = useBoardify();
  const [val, setVal] = useState(current ?? "");
  const [err, setErr] = useState(false);
  const save = async () => {
    const v = val.trim();
    if (!v) {
      await s.setShortcut(clipId, null);
      setErr(false);
      return;
    }
    const norm = normalizeShortcut(v);
    if (!norm) {
      setErr(true);
      return;
    }
    setErr(false);
    setVal(norm);
    await s.setShortcut(clipId, norm);
  };
  return (
    <div>
      <p className="text-zinc-500 uppercase tracking-[0.14em] text-[10px] font-semibold">Snippet</p>
      <div className="mt-1 flex items-center gap-1.5">
        <input
          value={val}
          onChange={(e) => { setVal(e.target.value); setErr(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          onBlur={save}
          placeholder=";nome — Invio per salvare"
          spellCheck={false}
          className={`flex-1 min-w-0 bg-white/[0.05] rounded-xl px-2.5 py-1.5 font-mono text-[12px] text-zinc-100 placeholder:text-zinc-600 outline-none ring-1 ${err ? "ring-red-500/60" : "ring-white/10 focus:ring-white/25"}`}
        />
        {current && (
          <button
            type="button"
            title="Rimuovi scorciatoia"
            onClick={() => { setVal(""); s.setShortcut(clipId, null); }}
            className="w-7 h-7 shrink-0 rounded-full grid place-items-center text-zinc-500 hover:text-white hover:bg-white/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-zinc-600 text-[11px] mt-1">
        Richiama con <span className="font-mono text-zinc-400">;nome</span> nello shelf + Invio
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-zinc-500 uppercase tracking-[0.14em] text-[10px] font-semibold">{label}</p>
      <p className="text-zinc-100 mt-1 break-words">{value}</p>
    </div>
  );
}

function HeaderIcon({
  children,
  onClick,
  title,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`w-8 h-8 rounded-full grid place-items-center ${
        active ? "bg-amber-400 text-black" : "text-zinc-400 hover:text-white hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
