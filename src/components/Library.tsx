import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Search, Star, Trash2, Copy, X, ShieldAlert, Pin, Pencil, LayoutGrid, List, Columns3, Settings2, Clock3, ArrowUpRight } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useBoardify } from "../store";
import { ClipCard } from "./ClipCard";
import { Brand } from "./Brand";
import { CategoryPills } from "./CategoryPills";
import { SpaceTabs } from "./SpaceTabs";
import { AppBadge } from "./AppBadge";
import { byteSize, groupClips, imageDimensions, prettyApp, timeAgo } from "../types";
import { formatCopy } from "../settings";
import { isTauri } from "../demo";
import { snappy, soft } from "../motion";
import { useT } from "../i18n";
import { useClipImageSrc } from "../clipImage";
import { clipColor, isDataImage, isSvgMarkup, parseGradientCss } from "../color";
import { normalizeShortcut } from "../smartActions";
import { beginClipDrag } from "../dragOut";

export function Library() {
  const s = useBoardify();
  const { t } = useT();
  const reduce = useReducedMotion();

  useEffect(() => {
    s.refresh();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !["INPUT", "TEXTAREA", "BUTTON", "SELECT"].includes((document.activeElement?.tagName ?? ""))) {
        const state = useBoardify.getState();
        const id = state.selectedId ?? state.clips[0]?.id;
        if (id) state.activateClip(id);
      }
      if (e.key === "Escape") {
        if (isTauri()) getCurrentWindow().hide().catch(() => {});
        else s.setView("shelf");
      }
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
      className="library-window glass gpu w-full h-full overflow-hidden flex select-none"
    >
      <div className="library-main flex-1 flex flex-col min-w-0">
        <div className="library-toolbar" data-tauri-drag-region>
          <Brand compact />
          <div className="library-search">
            <Search className="w-4 h-4 text-zinc-500" />
            <input
              value={s.query}
              onChange={(e) => s.setQuery(e.target.value)}
              placeholder={t("library.searchPlaceholder")} aria-label={t("library.searchAria")}
              className="bg-transparent outline-none flex-1 min-w-0 text-[12px] placeholder:text-zinc-500"
            />
          </div>
          <div className="ml-auto flex items-center gap-1">
            {(["card", "list", "board"] as const).map((v) => (
              <button
                key={v}
                title={v === "card" ? t("library.viewCard") : v === "list" ? t("library.viewList") : t("library.viewBoard")}
                aria-pressed={s.settings.libraryView === v}
                onClick={() => s.patchSettings({ libraryView: v })}
                className={`library-view-button ${s.settings.libraryView === v ? "is-active" : ""}`}
              >
                {v === "card" ? <LayoutGrid className="w-4 h-4" /> : v === "list" ? <List className="w-4 h-4" /> : <Columns3 className="w-4 h-4" />}
              </button>
            ))}
            <button title={t("library.closeLibrary")} aria-label={t("library.closeLibrary")} className="icon-button library-close" onClick={() => { if (isTauri()) getCurrentWindow().hide().catch(() => {}); else s.setView("shelf"); }}><X size={16} /></button>
            <button
              title={t("shelf.settings")}
              onClick={s.openSettings}
              className="w-8 h-8 rounded-full grid place-items-center text-zinc-400 hover:text-white"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="library-heading"><div><span className="eyebrow">{t("library.eyebrow")}</span><h1>{s.categoryFilter === "all" ? t("library.title") : s.categoryFilter}</h1><p>{t("library.subtitle")}</p></div><span className="library-count">{s.clips.length === 1 ? t("library.countOne") : t("library.count", { count: s.clips.length })}</span></div>
        {s.settings.showCollections && (
        <div className="library-collections">
          <SpaceTabs layoutId="lib-space" />
          <CategoryPills
            layoutId="lib-pill"
            categories={s.categories}
            active={s.categoryFilter}
            onSelect={s.setCategory}
            onCreate={s.createCategory}
          />
        </div>
        )}
        <div className="library-clips flex-1 overflow-y-auto nice-scroll">
          {s.settings.libraryView === "board" ? (
            <div className="flex gap-3 overflow-x-auto no-scrollbar h-full items-start">
              {s.categories
                .filter((c) => c.name !== "History" && c.count > 0)
                .map((col) => (
                  <div key={col.id} className="library-board-column shrink-0">
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
          <div className="library-timeline">
            {groupClips(s.clips).map((group) => <section key={group.label}>
              <div className="timeline-label"><Clock3 size={12} /><span>{group.label}</span><span>{group.items.length}</span></div>
              <div className="library-grid">
                <AnimatePresence mode="popLayout" initial={false}>
                  {group.items.map((clip, i) => <ClipCard key={clip.id} clip={clip} index={i} selected={clip.id === selected?.id} variant="grid" />)}
                </AnimatePresence>
              </div>
            </section>)}
          </div>
          )}
          {s.clips.length === 0 && (
            <div className="py-20 text-center text-zinc-500">
              <p className="text-[15px] font-semibold text-zinc-300">{t("library.emptyTitle")}</p>
              <p className="text-[12.5px] mt-1">{t("library.emptyHint")}</p>
            </div>
          )}
        </div>
        <footer className="library-footer"><span><span className="status-dot" /> {s.settings.autoCapture ? t("library.captureOn") : t("library.captureOff")}</span><span><kbd>{t("kbd.enter")}</kbd> {t("library.footerCopy")} <span className="footer-divider" /> <kbd>Esc</kbd> {t("library.footerClose")}</span></footer>
      </div>

      <div className="library-inspector shrink-0 flex flex-col">
        <AnimatePresence mode="wait" initial={false}>
          {selected ? (
            <InspectorPanel key={selected.id} clipId={selected.id} />
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="m-auto text-zinc-600 text-[13px]"
            >
              {t("library.selectClip")}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function InspectorPanel({ clipId }: { clipId: string }) {
  const s = useBoardify();
  const { t, locale } = useT();
  const selected = useBoardify((st) => st.clips.find((c) => c.id === clipId) ?? null);
  const inspectorSrc = useClipImageSrc(selected?.id ?? "", selected?.kind === "image" && !!selected?.image_path);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  if (!selected) return null;
  const editable =
    selected.kind !== "image" && selected.kind !== "file" && !selected.image_path;
  const original = selected.text ?? selected.preview ?? "";
  const dirty = draft.trim() !== original.trim();
  const canSave = dirty && draft.trim().length > 0 && !saving;

  const startEdit = () => {
    setDraft(original);
    setSaveError(false);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setSaveError(false);
  };
  const saveEdit = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(false);
    try {
      await s.editClip(selected.id, draft);
      await s.refresh();
      setEditing(false);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
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
          {t("library.preview")}
        </p>
        {editable && !editing && (
          <HeaderIcon title={t("library.edit")} onClick={startEdit}>
            <Pencil className="w-4 h-4" />
          </HeaderIcon>
        )}
        <HeaderIcon
          title={t("action.pin")}
          active={!!selected.is_pinned}
          onClick={() => s.togglePin(selected.id)}
        >
          <Pin className={`w-4 h-4 ${selected.is_pinned ? "fill-current" : ""}`} />
        </HeaderIcon>
        <HeaderIcon
          title={t("action.favorite")}
          active={selected.is_favorite}
          onClick={() => s.toggleFav(selected.id)}
        >
          <Star className={`w-4 h-4 ${selected.is_favorite ? "fill-current" : ""}`} />
        </HeaderIcon>
        <HeaderIcon title={t("action.delete")} onClick={() => s.deleteClip(selected.id)}>
          <Trash2 className="w-4 h-4" />
        </HeaderIcon>
        <HeaderIcon title={t("action.close")} onClick={() => { if (isTauri()) getCurrentWindow().hide().catch(() => {}); else s.setView("shelf"); }}>
          <X className="w-4 h-4" />
        </HeaderIcon>
      </div>
      <div className="px-4">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setSaveError(false); }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); saveEdit(); }
                if (e.key === "Escape") { e.stopPropagation(); cancelEdit(); }
              }}
              autoFocus
              rows={6}
              spellCheck={false}
              aria-label={t("library.edit")}
              className={`w-full resize-y min-h-[120px] max-h-52 overflow-y-auto nice-scroll bg-white/[0.05] rounded-2xl p-3.5 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words ring-1 outline-none text-zinc-100 ${saveError ? "ring-red-500/60" : "ring-white/15 focus:ring-white/30"}`}
            />
            {saveError && <p className="text-red-400 text-[12px]">{t("settings.actionFailed")}</p>}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={saveEdit}
                disabled={!canSave}
                className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-white text-black disabled:opacity-40"
              >
                {t("library.editSave")}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="px-3 py-1.5 rounded-full text-[12px] bg-white/[0.06] text-zinc-300 hover:text-white"
              >
                {t("library.editCancel")}
              </button>
            </div>
          </div>
        ) : clipColor(selected) ? (
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
          inspectorSrc ? (
          <img
            src={inspectorSrc}
            alt=""
            draggable
            onDragStart={(e) => {
              if (beginClipDrag(selected, e.dataTransfer, e.currentTarget, () => {})) e.preventDefault();
            }}
            className="w-full max-h-52 object-cover rounded-2xl ring-1 ring-white/10 bg-[#111] cursor-grab"
          />
          ) : (
            <div className="w-full h-44 rounded-2xl ring-1 ring-white/10 bg-[#111]" />
          )
        ) : (
          <div className="max-h-52 overflow-y-auto nice-scroll bg-white/[0.04] rounded-2xl p-3.5 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words ring-1 ring-white/10">
            {selected.text ?? selected.preview}
          </div>
        )}
      </div>
      <div className="px-5 py-4 space-y-3.5 text-[12.5px] flex-1 overflow-y-auto nice-scroll">
        <Meta label={t("library.metaCreated")} value={`${new Date(selected.created_at).toLocaleString(locale === "it" ? "it-IT" : "en-GB", { dateStyle: "medium", timeStyle: "short" })} · ${timeAgo(selected.created_at, locale)}`} />
        <div>
          <p className="text-zinc-500 uppercase tracking-[0.14em] text-[10px] font-semibold">{t("library.metaApp")}</p>
          <p className="text-zinc-100 mt-1 flex items-center gap-2">
            <AppBadge name={selected.source_app} icon={selected.source_icon} size={18} />
            {prettyApp(selected.source_app)}
          </p>
        </div>
        {imageDimensions(selected) && (
          <Meta label={t("library.metaDims")} value={imageDimensions(selected)!} />
        )}
        <Meta label={t("library.metaDetails")} value={byteSize(selected)} />
        <SnippetRow key={`snip-${selected.id}`} clipId={selected.id} current={selected.inline_shortcut ?? null} />
        {selected.is_sensitive && (
          <p className="flex items-center gap-1.5 text-amber-400 text-[12px]">
            <ShieldAlert className="w-3.5 h-3.5" /> {t("library.sensitive")}
          </p>
        )}
        {s.categories.filter((c) => c.name !== "History").length > 0 && (
          <div>
            <p className="text-zinc-500 uppercase tracking-[0.14em] text-[10px] font-semibold mb-1.5">
              {t("library.categories")}
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
                const txt = formatCopy(selected.text ?? selected.preview, mode);
                if (isTauri()) {
                  const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
                  await writeText(txt);
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
          className="primary-copy-button"
        >
          <Copy className="w-4 h-4" /> {t("library.copyToClipboard")} <ArrowUpRight size={14} />
        </motion.button>
      </div>
    </motion.div>
  );
}

function SnippetRow({ clipId, current }: { clipId: string; current: string | null }) {
  const s = useBoardify();
  const { t, locale } = useT();
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
      <p className="text-zinc-500 uppercase tracking-[0.14em] text-[10px] font-semibold">{t("library.snippet")}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <input
          value={val}
          onChange={(e) => { setVal(e.target.value); setErr(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          onBlur={save}
          placeholder={t("library.snippetPlaceholder")}
          spellCheck={false}
          className={`flex-1 min-w-0 bg-white/[0.05] rounded-xl px-2.5 py-1.5 font-mono text-[12px] text-zinc-100 placeholder:text-zinc-600 outline-none ring-1 ${err ? "ring-red-500/60" : "ring-white/10 focus:ring-white/25"}`}
        />
        {current && (
          <button
            type="button"
            title={t("library.snippetRemove")}
            onClick={() => { setVal(""); s.setShortcut(clipId, null); }}
            className="w-7 h-7 shrink-0 rounded-full grid place-items-center text-zinc-500 hover:text-white hover:bg-white/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-zinc-600 text-[11px] mt-1">
        {t("library.snippetHintPre")} <span className="font-mono text-zinc-400">{locale === "it" ? ";nome" : ";name"}</span> {t("library.snippetHintPost")}
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
        active ? "bg-white text-black" : "text-zinc-400 hover:text-white hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
