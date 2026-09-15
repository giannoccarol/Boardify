import { memo, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Pin, Copy, Star, Trash2, ShieldAlert, Code2, Link2, Play, Check, QrCode } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Clip } from "../types";
import { byteSize, cardTitle, imageFileUrl, timeAgo } from "../types";
import { clipSizeClass } from "../settings";
import { useBoardify } from "../store";
import { AppBadge } from "./AppBadge";
import { extractUrl, parseMedia } from "../linkMeta";
import { cardDelay, snappy, spring } from "../motion";
import { clipColor, isDataImage, isDarkColor, isSvgMarkup, parseGradientCss, formatColor, type ColorFmt } from "../color";
import { guessLang } from "../code";
import { parseUnit } from "../units";

export { spring };

interface Props {
  clip: Clip;
  selected: boolean;
  index: number;
  variant?: "shelf" | "grid" | "list";
}

export const ClipCard = memo(function ClipCard({ clip, selected, index, variant = "shelf" }: Props) {
  const { copyClip, toggleFav, togglePin, deleteClip, select, toggleMulti, multiSelect, activateClip, setPreview, settings } = useBoardify();
  const isMulti = multiSelect.includes(clip.id);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const flashCopied = () => {
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  };
  const handleCopy = () => {
    copyClip(clip.id);
    flashCopied();
  };
  if (variant === "list") {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          if (e.shiftKey) toggleMulti(clip.id);
          else select(clip.id);
        }}
        onDoubleClick={() => activateClip(clip.id)}
        className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer ${
          selected ? "bg-white/10 ring-1 ring-white/20" : "hover:bg-white/[0.05]"
        }`}
      >
        <AppBadge name={clip.source_app} icon={clip.source_icon} size={22} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] truncate">{cardTitle(clip)}</p>
          <p className="text-[11px] text-zinc-500">{timeAgo(clip.created_at)}</p>
        </div>
        {clip.is_pinned && <Pin className="w-3.5 h-3.5 text-sky-300 fill-sky-300" />}
      </motion.div>
    );
  }
  const size = clipSizeClass(settings.clipSize, variant === "grid" ? "grid" : "shelf");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.12 } }}
      transition={{ ...spring, delay: cardDelay(index) }}
      className="shrink-0"
      style={{ willChange: "transform, opacity" }}
    >
      <div
        draggable
        onDragStart={(e: DragEvent) => {
          e.dataTransfer.setData("text/plain", clip.text ?? clip.preview);
          const url = imageFileUrl(clip);
          if (url) e.dataTransfer.setData("text/uri-list", url + "\r\n");
        }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          if (e.shiftKey) {
            toggleMulti(clip.id);
            return;
          }
          select(clip.id);
          if (settings.clickAction !== "select") {
            flashCopied();
            activateClip(clip.id);
          }
          if (clip.kind === "link" || clip.kind === "image") setPreview(clip.id);
        }}
        onDoubleClick={() => activateClip(clip.id)}
      >
      <motion.div
        initial="rest"
        whileHover="hover"
        whileTap={{ scale: 0.97 }}
        className={`clip-card group relative ${size} rounded-[18px] overflow-hidden cursor-pointer text-left
          ${selected ? "ring-2 ring-white/30" : "ring-1 ring-white/[0.08]"}
          ${isMulti ? "ring-2 ring-emerald-400/80" : ""}
          bg-[#1a1a1e]`}
      >
        <motion.div
          variants={{ rest: { y: 0, scale: 1 }, hover: { y: -2, scale: 1.02 } }}
          transition={snappy}
          className="absolute inset-0"
        >
          <CardFace clip={clip} />
        </motion.div>

        <div className={`absolute top-1.5 right-1.5 z-10 flex gap-1 transition-opacity duration-150 ${copied ? "opacity-0 pointer-events-none" : "opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"}`}>
          <HoverBtn title="Fissa" active={!!clip.is_pinned} onClick={() => togglePin(clip.id)}>
            <Pin className={`w-3.5 h-3.5 ${clip.is_pinned ? "fill-current" : ""}`} />
          </HoverBtn>
          <HoverBtn title="Copia" onClick={handleCopy}>
            <Copy className="w-3.5 h-3.5" />
          </HoverBtn>
          <HoverBtn title="Elimina" onClick={() => deleteClip(clip.id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </HoverBtn>
          <HoverBtn
            title="Preferito"
            active={clip.is_favorite}
            onClick={() => toggleFav(clip.id)}
          >
            <Star className={`w-3.5 h-3.5 ${clip.is_favorite ? "fill-current" : ""}`} />
          </HoverBtn>
        </div>

        {copied ? (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute top-1.5 left-1.5 z-10 h-7 px-2.5 rounded-full flex items-center gap-1 text-[11px] font-semibold backdrop-blur-md bg-black/60 text-white"
          >
            <Check className="w-3.5 h-3.5" />
            Copied
          </motion.span>
        ) : (
          <>
            {clip.is_favorite && (
              <Star className="absolute top-2 left-2 z-10 w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            )}
            {clip.is_sensitive && (
              <ShieldAlert className="absolute top-2 left-2 z-10 w-3.5 h-3.5 text-amber-400" />
            )}
          </>
        )}
      </motion.div>
      </div>
    </motion.div>
  );
});

function HoverBtn({
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
    <motion.button
      title={title}
      whileTap={{ scale: 0.86 }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`w-7 h-7 rounded-full grid place-items-center backdrop-blur-md
        ${active ? "bg-amber-400 text-black" : "bg-black/60 text-white hover:bg-black/80"}`}
    >
      {children}
    </motion.button>
  );
}

function CardFace({ clip }: { clip: Clip }) {
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
        <img src={dataImg} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
        <Meta clip={clip} light />
      </>
    );
  }
  if (clip.kind === "image" && clip.image_path) {
    return (
      <>
        <img
          src={convertFileSrc(clip.image_path)}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        <PlayMark />
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
          {cardTitle(clip)}
        </p>
        <PlayMark />
        <Meta clip={clip} light />
      </>
    );
  }
  const lang = clip.kind === "code" ? guessLang(clip.text ?? clip.preview) : null;
  const unit = clip.kind !== "code" && !url && !color ? parseUnit(clip.text ?? clip.preview) : null;
  return (
    <div className="absolute inset-0 flex flex-col bg-[#1c1c20]">
      <div className="flex-1 px-3 pt-3 min-h-0">
        {clip.kind === "code" ? (
          <span className="inline-flex items-center gap-1.5 mb-1.5 px-2 py-0.5 rounded-full bg-white/[0.06] text-[10.5px] text-zinc-400">
            <Code2 className="w-3.5 h-3.5" />
            {lang ? lang.label : "Codice"}
          </span>
        ) : clip.kind === "link" ? (
          <Link2 className="w-5 h-5 text-zinc-500 mb-1.5" />
        ) : null}
        <p className={`leading-snug text-zinc-100 line-clamp-4 whitespace-pre-wrap break-words ${clip.kind === "code" ? "font-mono text-[11.5px]" : "text-[12.5px]"}`}>
          {clip.is_sensitive ? "••••••••" : cardTitle(clip)}
        </p>
        {unit && (
          <p className="mt-1 font-mono text-[11px] text-emerald-300 truncate">
            = {unit.conversions[0]?.value}
          </p>
        )}
      </div>
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
  const title = swatch ?? (clip.kind === "color" ? clip.color_hex : null);
  const [fmtIdx, setFmtIdx] = useState(0);
  const fmtTitle = title ? formatColor(title, COLOR_FMTS[fmtIdx % COLOR_FMTS.length]) : null;
  return (
    <div
      className={`absolute bottom-0 inset-x-0 z-20 px-2 pb-1.5 pt-7 flex items-end gap-1.5 pointer-events-none ${
        light ? "bg-gradient-to-t from-black/75 via-black/30 to-transparent" : "bg-gradient-to-t from-black/55 via-black/10 to-transparent"
      }`}
    >
      <AppBadge name={clip.source_app} icon={clip.source_icon} size={20} />
      <div className="min-w-0 flex-1">
        {fmtTitle && (
          <button
            type="button"
            title="Cambia formato (HEX/RGB/HSL)"
            onClick={(e) => { e.stopPropagation(); setFmtIdx((i) => (i + 1) % COLOR_FMTS.length); }}
            className="pointer-events-auto block max-w-full truncate text-[12px] font-semibold text-white leading-none mb-0.5 hover:underline"
          >
            {fmtTitle}
          </button>
        )}
        <p className="text-[10.5px] truncate text-white/80">
          {timeAgo(clip.created_at)}
        </p>
      </div>
      {extractUrl(clip.text ?? clip.preview) && (
        <QrCode className="w-3 h-3 shrink-0 text-white/60" />
      )}
      <span className="text-[10px] shrink-0 tabular-nums text-white/70">
        {byteSize(clip)}
      </span>
    </div>
  );
}
