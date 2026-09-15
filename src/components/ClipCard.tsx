import { memo, useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Pin, Copy, Star, Trash2, ShieldAlert, Code2, Link2, Play, Check } from "lucide-react";
import { useClipImageSrc } from "../clipImage";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Clip } from "../types";
import { cardTitle, imageFileUrl, kindLabel, prettyApp, timeAgo } from "../types";
import { clipSizeClass } from "../settings";
import { useBoardify } from "../store";
import { isTauri } from "../demo";
import { AppBadge } from "./AppBadge";
import { ActionGlyph } from "./ActionGlyph";
import { extractUrl, parseMedia } from "../linkMeta";
import { actionTrayVariants, cardDelay, snappy, spring } from "../motion";
import { clipColor, isDataImage, isDarkColor, isSvgMarkup, parseGradientCss, formatColor, type ColorFmt } from "../color";
import { formatCode, guessLang } from "../code";
import { parseUnit } from "../units";
import { useT } from "../i18n";

export { spring };

interface Props {
  clip: Clip;
  selected: boolean;
  index: number;
  variant?: "shelf" | "grid" | "list";
}

export const ClipCard = memo(function ClipCard({ clip, selected, index, variant = "shelf" }: Props) {
  // Selettori stretti: la card si ri-renderizza solo se cambia davvero qualcosa
  // che mostra (niente re-render a ogni keystroke nella search).
  const copyClip = useBoardify((s) => s.copyClip);
  const toggleFav = useBoardify((s) => s.toggleFav);
  const togglePin = useBoardify((s) => s.togglePin);
  const deleteClip = useBoardify((s) => s.deleteClip);
  const select = useBoardify((s) => s.select);
  const toggleMulti = useBoardify((s) => s.toggleMulti);
  const activateClip = useBoardify((s) => s.activateClip);
  const setPreview = useBoardify((s) => s.setPreview);
  const clipSize = useBoardify((s) => s.settings.clipSize);
  const clickAction = useBoardify((s) => s.settings.clickAction);
  const isMulti = useBoardify((s) => s.multiSelect.includes(clip.id));
  const { t, locale } = useT();
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const [copySequence, setCopySequence] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragIgnore = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (dragIgnore.current) clearTimeout(dragIgnore.current);
  }, []);

  const flashCopied = () => {
    setCopied(true);
    setCopySequence((n) => n + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  };
  const activate = async () => {
    if (await activateClip(clip.id)) flashCopied();
  };
  const openCard = () => {
    select(clip.id);
    if (variant === "shelf") {
      setPreview(useBoardify.getState().previewId === clip.id ? null : clip.id);
    } else if (variant !== "list" && clickAction !== "select") {
      activate();
    }
  };
  const keyboardCard = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); activate(); }
    if (e.key === " ") { e.preventDefault(); e.stopPropagation(); select(clip.id); setPreview(clip.id); }
  };

  if (variant === "list") {
    return (
      <motion.div
        layout
        tabIndex={0}
        role="group"
        aria-label={cardTitle(clip)}
        onKeyDown={keyboardCard}
        transition={spring}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
        onClick={(e) => { if (e.shiftKey) toggleMulti(clip.id); else select(clip.id); }}
        onDoubleClick={activate}
        className={`clip-row flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer ${selected ? "is-selected" : ""}`}
      >
        <AppBadge name={clip.source_app} icon={clip.source_icon} size={22} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] truncate">{cardTitle(clip)}</p>
          <p className="text-[11px] text-zinc-500">{timeAgo(clip.created_at, locale)}</p>
        </div>
        {clip.is_pinned && <Pin className="w-3.5 h-3.5 text-white fill-white" />}
      </motion.div>
    );
  }
  const size = clipSizeClass(clipSize, variant === "grid" ? "grid" : "shelf");

  return (
    <motion.div
      layout
      initial={reduce ? false : { opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
      transition={{ ...spring, delay: cardDelay(index) }}
      className="clip-tile group shrink-0"
    >
      {/* div nativo: nessuna prop di animazione rimasta, framer renderebbe lo stesso DOM */}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}
        className={`clip-card relative ${size} overflow-hidden cursor-pointer text-left`}
        data-selected={selected}
        data-multi={isMulti}
        data-kind={clip.kind}
        tabIndex={0}
        role="group"
        aria-label={cardTitle(clip)}
        onKeyDown={keyboardCard}
        draggable={variant !== "shelf"}
        data-tauri-drag-region="false"
        onMouseDown={(e) => e.stopPropagation()}
        onDragStartCapture={(e: DragEvent) => {
          if (variant === "shelf") { e.preventDefault(); return; }
          e.dataTransfer.setData("text/plain", clip.text ?? clip.preview);
          const url = imageFileUrl(clip);
          if (url) e.dataTransfer.setData("text/uri-list", url + "\r\n");
          if (isTauri()) {
            const w = getCurrentWindow();
            if (dragIgnore.current) clearTimeout(dragIgnore.current);
            dragIgnore.current = setTimeout(() => {
              dragIgnore.current = null;
              w.setIgnoreCursorEvents(true).catch(() => {});
            }, 160);
          }
        }}
        onDragEndCapture={() => {
          if (dragIgnore.current) clearTimeout(dragIgnore.current);
          dragIgnore.current = null;
          if (isTauri()) getCurrentWindow().setIgnoreCursorEvents(false).catch(() => {});
        }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          e.stopPropagation();
          if (e.shiftKey) toggleMulti(clip.id);
          else openCard();
        }}
        onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest("button")) activate(); }}
      >
        <CardFace clip={clip} />
        {/* Azioni montate solo all'occorrenza: su liste lunghe evita migliaia
            di nodi/SVG nascosti. Stesso fade di prima (initial/animate/exit). */}
        <AnimatePresence initial={false}>
          {(hovered || focused || copied) && (
            <motion.div
              className="clip-actions gpu"
              role="group"
              aria-label={t("card.actions")}
              variants={actionTrayVariants}
              initial={reduce ? false : "hidden"}
              animate="shown"
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : "exit"}
            >
          <HoverBtn title={t("action.pin")} active={!!clip.is_pinned} onClick={() => togglePin(clip.id)}><Pin size={13} className={clip.is_pinned ? "fill-current" : ""} /></HoverBtn>
          <HoverBtn title={copied ? t("card.copied") : t("action.copy")} active={copied} sequence={copySequence} onClick={async () => { if (await copyClip(clip.id)) flashCopied(); }}>{copied ? <Check size={13} /> : <Copy size={13} />}</HoverBtn>
          <HoverBtn title={t("action.delete")} onClick={() => deleteClip(clip.id)}><Trash2 size={13} /></HoverBtn>
          <HoverBtn title={t("action.favorite")} active={clip.is_favorite} onClick={() => toggleFav(clip.id)}><Star size={13} className={clip.is_favorite ? "fill-current" : ""} /></HoverBtn>
            </motion.div>
          )}
        </AnimatePresence>
        {copied && <span className="sr-only" role="status">{t("card.copied")}</span>}
      </div>
    </motion.div>
  );
}, clipCardEqual);

// Il refresh ricrea gli oggetti clip: senza comparatore ogni keystroke
// ri-renderizzerebbe tutte le card. Stessi pixel -> skip (clipSize,
// clickAction, locale e multi arrivano da hook propri e restano corretti).
function clipCardEqual(p: Props, n: Props): boolean {
  const a = p.clip;
  const b = n.clip;
  return (
    p.selected === n.selected &&
    p.index === n.index &&
    p.variant === n.variant &&
    a.id === b.id &&
    a.text === b.text &&
    a.preview === b.preview &&
    a.kind === b.kind &&
    a.color_hex === b.color_hex &&
    a.image_path === b.image_path &&
    a.source_app === b.source_app &&
    a.source_icon === b.source_icon &&
    a.is_favorite === b.is_favorite &&
    a.is_pinned === b.is_pinned &&
    a.created_at === b.created_at
  );
}

function HoverBtn({ children, onClick, title, active, sequence }: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  sequence?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      title={title}
      aria-label={title}
      aria-pressed={active}
      whileTap={reduce ? undefined : { scale: 0.88 }}
      transition={snappy}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`clip-action-button ${active ? "is-active" : ""}`}
    >
      <ActionGlyph active={active} sequence={sequence}>{children}</ActionGlyph>
    </motion.button>
  );
}

function CardFace({ clip }: { clip: Clip }) {
  const { locale } = useT();
  const imgSrc = useClipImageSrc(clip.id, clip.kind === "image" && !!clip.image_path);
  const url = extractUrl(clip.text ?? clip.preview);
  const media = url ? parseMedia(url) : null;
  const color = clipColor(clip);
  const gradient = parseGradientCss(clip.text) ?? parseGradientCss(clip.preview);
  const svg = isSvgMarkup(clip.text) ? clip.text!.trim() : isSvgMarkup(clip.preview) ? clip.preview.trim() : null;
  const dataImg = isDataImage(clip.text) ? clip.text!.trim() : isDataImage(clip.preview) ? clip.preview.trim() : null;

  if (gradient) {
    return (
      <div className="absolute inset-0" style={{ backgroundImage: gradient }}>
        <Meta clip={clip} light />
      </div>
    );
  }
  if (color) {
    const dark = isDarkColor(color);
    return (
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(45deg,#bbb 25%,transparent 25%),linear-gradient(-45deg,#bbb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#bbb 75%),linear-gradient(-45deg,transparent 75%,#bbb 75%)",
          backgroundSize: "12px 12px",
          backgroundPosition: "0 0,0 6px,6px -6px,-6px 0",
        }}
      >
        <div className="absolute inset-0" style={{ background: color }} />
        <Meta clip={clip} light={dark} swatch={color} />
      </div>
    );
  }
  if (svg) {
    return (
      <>
        <div className="absolute inset-0 bg-[#111] grid place-items-center p-3">
          <img
            src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
            alt=""
            draggable={false}
            loading="lazy"
            className="max-w-full max-h-full object-contain"
          />
        </div>
        <Meta clip={clip} light />
      </>
    );
  }
  if (dataImg) {
    return (
      <>
        <img src={dataImg} alt="" loading="lazy" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
        <Meta clip={clip} light />
      </>
    );
  }
  if (clip.kind === "image" && clip.image_path) {
    return (
      <>
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-[#111]" />
        )}
        <Meta clip={clip} light />
      </>
    );
  }
  if (media?.thumbnail) {
    return (
      <>
        <img
          src={media.thumbnail}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/30" />
        <p className="absolute top-2 left-2 right-2 text-[11.5px] font-semibold leading-snug line-clamp-3 text-white drop-shadow">
          {clip.preview || cardTitle(clip)}
        </p>
        <PlayMark />
        <Meta clip={clip} light />
      </>
    );
  }
  const lang = clip.kind === "code" ? guessLang(clip.text ?? clip.preview) : null;
  const unit = clip.kind !== "code" && !url && !color ? parseUnit(clip.text ?? clip.preview, locale) : null;
  return (
    <div className="clip-text-face absolute inset-0 flex flex-col">
      <motion.div
        className="clip-text-content flex-1 min-h-0"
        variants={{ rest: { y: 0 }, hover: { y: 28 } }}
        transition={snappy}
      >
        {clip.kind === "code" ? (
          <span className="inline-flex items-center gap-1.5 mb-1.5 px-2 py-0.5 rounded-full bg-white/[0.06] text-[10.5px] text-zinc-400">
            <Code2 className="w-3.5 h-3.5" />
            {lang ? lang.label : kindLabel("code", locale)}
          </span>
        ) : clip.kind === "link" ? (
          <Link2 className="w-5 h-5 text-zinc-500 mb-1.5" />
        ) : null}
        <p className={`leading-snug text-zinc-100 line-clamp-4 whitespace-pre-wrap break-words ${clip.kind === "code" ? "font-mono text-[11.5px]" : "text-[12.5px]"}`}>
          {clip.is_sensitive ? "••••••••" : (clip.kind === "code" ? formatCode(clip.text || clip.preview) : (clip.text || clip.preview).trim())}
        </p>
        {unit && (
          <p className="mt-1 font-mono text-[11px] text-emerald-300 truncate">
            = {unit.conversions[0]?.value}
          </p>
        )}
      </motion.div>
      <Meta clip={clip} />
    </div>
  );
}

function PlayMark() {
  return (
    <div className="absolute inset-0 grid place-items-center pointer-events-none">
      <span className="w-9 h-9 rounded-full bg-black/55 ring-1 ring-white/20 grid place-items-center">
        <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
      </span>
    </div>
  );
}

const COLOR_FMTS: ColorFmt[] = ["hex", "rgb", "hsl"];

function Meta({ clip, light, swatch }: { clip: Clip; light?: boolean; swatch?: string }) {
  const { t, locale } = useT();
  const title = swatch ?? (clip.kind === "color" ? clip.color_hex : null);
  const [fmtIdx, setFmtIdx] = useState(0);
  const fmtTitle = title ? formatColor(title, COLOR_FMTS[fmtIdx % COLOR_FMTS.length]) : null;
  return (
    <div
      className={`clip-meta absolute bottom-0 inset-x-0 z-20 flex items-end gap-1.5 pointer-events-none ${light || swatch ? "clip-meta-visual" : "clip-meta-text"}`}
    >
      <AppBadge name={clip.source_app} icon={clip.source_icon} size={18} />
      <div className="min-w-0 flex-1">
        {fmtTitle && (
          <button
            type="button"
            title={t("library.changeFormat")}
            onClick={(e) => { e.stopPropagation(); setFmtIdx((i) => (i + 1) % COLOR_FMTS.length); }}
            className="pointer-events-auto block max-w-full truncate text-[12px] font-semibold text-white leading-none hover:underline"
          >
            {fmtTitle}
          </button>
        )}
        {!fmtTitle && <p className="text-[9px] truncate text-white/85">{prettyApp(clip.source_app)}</p>}
      </div>
      <p className="shrink-0 text-[9px] tabular-nums text-white/60">
        {timeAgo(clip.created_at, locale)}
      </p>
      {clip.is_favorite && <Star size={10} className="shrink-0 text-white fill-white" />}
      {clip.is_sensitive && <ShieldAlert size={11} className="shrink-0 text-white" />}
    </div>
  );
}
