import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Copy, ExternalLink, Link2, X, Pin, Star, QrCode, Mail, Phone, MapPin, FolderOpen } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Clip } from "../types";
import { cardTitle } from "../types";
import { extractUrl, loadLinkMeta, parseMedia, type LinkMeta } from "../linkMeta";
import { copyPlain, toHtml, toMarkdown, toQrSvg } from "../linkActions";
import { clipColor, contrastRatio, formatColor, harmonies, wcagBadge } from "../color";
import { guessLang } from "../code";
import { parseUnit } from "../units";
import { extractEmail, extractFilePath, extractPhone, extractPlaceholders, isAbsolutePath, isDirectVideo, isLikelyAddress, isQrPayload, isVideoUrl, toMapsUrl } from "../smartActions";
import { useBoardify } from "../store";
import { isTauri } from "../demo";
import { spring } from "../motion";

export function ClipPreview({ clip }: { clip: Clip }) {
  const s = useBoardify();
  const url = extractUrl(clip.text ?? clip.preview);
  const stillShot = typeof document !== "undefined" && document.documentElement.classList.contains("shot");
  const [meta, setMeta] = useState<LinkMeta | null>(url ? parseMedia(url) : null);
  const [showQr, setShowQr] = useState(false);
  // QR: link oppure payload testuali (WIFI:/otpauth/vCard) che stanno nella categoria QR Code
  const qrTarget = useMemo(() => {
    if (url) return url;
    const t = (clip.text ?? clip.preview).trim();
    return isQrPayload(t) ? t : null;
  }, [url, clip.text, clip.preview]);
  const qrSvg = useMemo(() => (showQr && qrTarget ? toQrSvg(qrTarget) : null), [showQr, qrTarget]);
  const colorHex = useMemo(
    () => clipColor({ kind: clip.kind, color_hex: clip.color_hex, text: clip.text, preview: clip.preview }),
    [clip.kind, clip.color_hex, clip.text, clip.preview]
  );
  const lang = useMemo(
    () => (clip.kind === "code" ? guessLang(clip.text ?? clip.preview) : null),
    [clip.kind, clip.text, clip.preview]
  );
  const unit = useMemo(
    () => (clip.kind !== "code" && !url && !colorHex ? parseUnit(clip.text ?? clip.preview) : null),
    [clip.kind, clip.text, clip.preview, colorHex, url]
  );

  useEffect(() => {
    if (!url) {
      setMeta(null);
      return;
    }
    let live = true;
    loadLinkMeta(url).then((m) => {
      if (live) setMeta(m);
    });
    return () => {
      live = false;
    };
  }, [url]);

  const openExternal = async (u: string) => {
    if (isTauri()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(u);
    } else {
      window.open(u, "_blank", "noopener");
    }
  };

  const open = () => (url ? openExternal(url) : undefined);

  const reveal = async (p: string) => {
    if (isTauri()) {
      try {
        const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
        await revealItemInDir(p);
        return;
      } catch {
        /* path mancante → copia */
      }
    }
    await copyPlain(p);
  };

  const openFile = async (p: string) => {
    if (isTauri()) {
      try {
        const { openPath } = await import("@tauri-apps/plugin-opener");
        await openPath(p);
        return;
      } catch {
        /* fallback copia */
      }
    }
    await copyPlain(p);
  };

  const smart = useMemo(() => {
    const text = clip.text ?? clip.preview;
    if (url || colorHex) return { email: null as string | null, phone: null as string | null, path: extractFilePath(text), address: false, placeholders: [] as string[] };
    return {
      email: extractEmail(text),
      phone: unit ? null : extractPhone(text),
      path: extractFilePath(text),
      address: isLikelyAddress(text),
      placeholders: extractPlaceholders(text),
    };
  }, [clip.text, clip.preview, url, colorHex, unit]);

  const badge =
    clip.kind === "link"
      ? (url && isVideoUrl(url) ? "Video" : "Link")
      : clip.kind === "image"
        ? "Immagine"
        : clip.kind === "color" || colorHex
          ? "Colore"
          : clip.kind === "code"
            ? (lang ? `Codice · ${lang.label}` : "Codice")
            : smart.placeholders.length > 0
              ? "Template"
              : smart.email
                ? "Email"
                : smart.phone
                  ? "Telefono"
                  : smart.path
                    ? "File"
                    : smart.address
                      ? "Indirizzo"
                      : unit
                        ? unit.title
                        : "Clip";

  return (
    <motion.div
      initial={{ opacity: 0, y: -18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={spring}
      className="gpu mt-2.5 w-[720px] max-w-[92vw] rounded-[24px] overflow-hidden select-none bg-[#0c0c0e] ring-1 ring-white/[0.10] shadow-[0_28px_80px_rgba(0,0,0,.55)]"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/[0.06]">
        <span className="flex items-center gap-1.5 text-[12px] text-zinc-400 px-2 py-1 rounded-full bg-white/[0.06]">
          <Link2 className="w-3.5 h-3.5" />
          {badge}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Tool title="Copia" onClick={() => s.copyClip(clip.id)}>
            <Copy className="w-3.5 h-3.5" />
            <span className="text-[12px] pr-0.5">Copy</span>
          </Tool>
          {url && (
            <Tool title="Apri nel browser" onClick={open}>
              <ExternalLink className="w-3.5 h-3.5" />
            </Tool>
          )}
          {qrTarget && (
            <Tool title="Mostra QR" active={showQr} onClick={() => setShowQr((v) => !v)}>
              <QrCode className="w-3.5 h-3.5" />
            </Tool>
          )}
          <Tool title="Fissa" active={!!clip.is_pinned} onClick={() => s.togglePin(clip.id)}>
            <Pin className={`w-3.5 h-3.5 ${clip.is_pinned ? "fill-current" : ""}`} />
          </Tool>
          <Tool title="Preferito" active={clip.is_favorite} onClick={() => s.toggleFav(clip.id)}>
            <Star className={`w-3.5 h-3.5 ${clip.is_favorite ? "fill-current" : ""}`} />
          </Tool>
          <Tool title="Chiudi" onClick={() => s.setPreview(null)}>
            <X className="w-3.5 h-3.5" />
          </Tool>
        </div>
      </div>

      {meta?.embed ? (
        <div className="relative bg-black aspect-video">
          {meta.thumbnail && (
            <img src={meta.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          {!stillShot && (
            <iframe
              title={meta.title}
              src={meta.embed}
              className="relative w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          )}
        </div>
      ) : url && isDirectVideo(url) ? (
        <video src={url} controls preload="metadata" className="w-full max-h-[360px] bg-black" />
      ) : clip.kind === "image" && clip.image_path ? (
        <img src={convertFileSrc(clip.image_path)} alt="" className="w-full max-h-[360px] object-contain bg-black" />
      ) : colorHex ? (
        <div className="h-48" style={{ background: colorHex }} />
      ) : meta?.thumbnail ? (
        <button type="button" onClick={open} className="block w-full bg-black">
          <img src={meta.thumbnail} alt="" className="w-full max-h-[280px] object-cover" />
        </button>
      ) : (
        <pre className="max-h-56 overflow-auto nice-scroll text-[13px] whitespace-pre-wrap break-words px-5 py-4">
          {clip.text ?? clip.preview}
        </pre>
      )}

      <div className="px-5 py-4">
        <p className="text-[15px] font-semibold tracking-tight leading-snug">
          {meta?.title && meta.title !== meta.host && meta.title !== "YouTube" && meta.title !== "Vimeo"
            ? meta.title
            : cardTitle(clip)}
        </p>
        {meta?.author && <p className="text-[12.5px] text-zinc-500 mt-0.5">{meta.author}</p>}
        {clip.kind !== "link" && !meta && (
          <p className="text-[12.5px] text-zinc-500 mt-1 whitespace-pre-wrap line-clamp-4">{clip.text ?? clip.preview}</p>
        )}
        {url && (
          <button
            type="button"
            onClick={open}
            className="mt-3 text-[12.5px] text-sky-400 hover:text-sky-300 break-all text-left"
          >
            {url}
          </button>
        )}
        {url && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <MiniBtn label="Copia MD" onClick={() => copyPlain(toMarkdown(url, meta?.title))} />
            <MiniBtn label="Copia HTML" onClick={() => copyPlain(toHtml(url, meta?.title))} />
          </div>
        )}
        {showQr && qrTarget && qrSvg && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white p-3 w-fit">
            <div className="w-28 h-28 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          </div>
        )}
        {smart.placeholders.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {smart.placeholders.map((p) => (
              <MiniBtn key={p} label={p} onClick={() => copyPlain(p)} />
            ))}
          </div>
        )}
        {colorHex && <ColorDetails hex={colorHex} />}
        {unit && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {unit.conversions.map((c) => (
              <MiniBtn key={c.label} label={`${c.label}: ${c.value}`} onClick={() => copyPlain(c.value)} />
            ))}
          </div>
        )}
        {(smart.email || smart.phone || smart.path || smart.address) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {smart.email && (
              <MiniBtn
                label={`Scrivi a ${smart.email}`}
                icon={<Mail className="w-3 h-3" />}
                onClick={() => openExternal(`mailto:${smart.email}`)}
              />
            )}
            {smart.phone && (
              <MiniBtn
                label={`Chiama ${smart.phone}`}
                icon={<Phone className="w-3 h-3" />}
                onClick={() => openExternal(`tel:${smart.phone!.replace(/[\s.()/\-]/g, "")}`)}
              />
            )}
            {smart.address && (
              <MiniBtn
                label="Apri in Mappe"
                icon={<MapPin className="w-3 h-3" />}
                onClick={() => openExternal(toMapsUrl(clip.text ?? clip.preview ?? ""))}
              />
            )}
            {smart.path && isAbsolutePath(smart.path) && (
              <MiniBtn
                label="Rivela nel file manager"
                icon={<FolderOpen className="w-3 h-3" />}
                onClick={() => reveal(smart.path!)}
              />
            )}
            {smart.path && isAbsolutePath(smart.path) && (
              <MiniBtn label="Apri file" onClick={() => openFile(smart.path!)} />
            )}
            {smart.path && !isAbsolutePath(smart.path) && (
              <MiniBtn label={`Copia path ${smart.path}`} onClick={() => copyPlain(smart.path!)} />
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ColorDetails({ hex }: { hex: string }) {
  const harm = useMemo(() => harmonies(hex), [hex]);
  const cWhite = contrastRatio(hex, "#FFFFFF");
  const cBlack = contrastRatio(hex, "#000000");
  const cells = [hex.toUpperCase(), harm?.comp, harm?.ana1, harm?.ana2].filter((x): x is string => !!x);
  return (
    <div className="mt-3 space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {(["hex", "rgb", "hsl"] as const).map((f) => (
          <MiniBtn key={f} label={formatColor(hex, f)} onClick={() => copyPlain(formatColor(hex, f))} />
        ))}
      </div>
      <div className="flex gap-1.5">
        {cells.map((c) => (
          <button
            key={c}
            type="button"
            title={`${c} — clicca per copiare`}
            onClick={() => copyPlain(c)}
            className="h-9 flex-1 rounded-xl ring-1 ring-white/15 hover:ring-white/40"
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {cWhite != null && (
          <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-300">
            Su bianco {cWhite}:1 · {wcagBadge(cWhite)}
          </span>
        )}
        {cBlack != null && (
          <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-300">
            Su nero {cBlack}:1 · {wcagBadge(cBlack)}
          </span>
        )}
      </div>
    </div>
  );
}

function MiniBtn({ label, onClick, icon }: { label: string; onClick: () => void; icon?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-[11.5px] bg-white/[0.06] text-zinc-300 hover:text-white hover:bg-white/[0.12] inline-flex items-center gap-1.5"
    >
      {icon}
      {label}
    </button>
  );
}

function Tool({
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
      className={`h-8 px-2 rounded-full flex items-center gap-1.5 text-zinc-300 hover:text-white hover:bg-white/[0.08] ${
        active ? "bg-white text-black hover:bg-white hover:text-black" : ""
      }`}
    >
      {children}
    </button>
  );
}
