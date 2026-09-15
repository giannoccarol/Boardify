import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Copy, ExternalLink, Link2, X, Pin, Star, QrCode, Mail, Phone, MapPin, FolderOpen, Image as ImageIcon, FileText, Code2, Palette, Clock3, Check, Sparkles } from "lucide-react";
import { useClipImageSrc } from "../clipImage";
import type { Clip } from "../types";
import { byteSize, imageDimensions, prettyApp, timeAgo } from "../types";
import { extractUrl, loadLinkMeta, parseMedia, type LinkMeta } from "../linkMeta";
import { toQrSvg } from "../linkActions";
import { clipColor, contrastRatio, harmonies, isDataImage, isSvgMarkup, parseGradientCss, wcagBadge } from "../color";
import { copyOptionsFor } from "../copyFormats";
import { formatCode, guessLang, tokensByLine, tokenizeCode } from "../code";
import { parseUnit } from "../units";
import { extractEmail, extractFilePath, extractPhone, extractPlaceholders, isAbsolutePath, isDirectVideo, isLikelyAddress, isQrPayload, isVideoUrl, toMapsUrl } from "../smartActions";
import { useBoardify } from "../store";
import { isTauri } from "../demo";
import { isRasterDataUrl } from "../ai/client";
import { useAiAssistant } from "../ai/useAi";
import { AiMenu } from "../ai/AiMenu";
import { AiPanel } from "../ai/AiPanel";
import type { AiActionCtx } from "../ai/prompts";
import { soft } from "../motion";
import { AppBadge } from "./AppBadge";
import { useT, type DictKey } from "../i18n";

export function ClipPreview({ clip }: { clip: Clip }) {
  const s = useBoardify();
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const { t, locale } = useT();
  const fileSrc = useClipImageSrc(clip.id, clip.kind === "image" && !!clip.image_path);
  const url = extractUrl(clip.text ?? clip.preview);
  const stillShot = typeof document !== "undefined" && document.documentElement.classList.contains("shot");
  const [loadedMeta, setLoadedMeta] = useState<{ url: string; value: LinkMeta } | null>(null);
  const meta = loadedMeta?.url === url ? loadedMeta.value : url ? parseMedia(url) : null;
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
    () => (clip.kind !== "code" && !url && !colorHex ? parseUnit(clip.text ?? clip.preview, locale) : null),
    [clip.kind, clip.text, clip.preview, colorHex, url]
  );

  useEffect(() => {
    if (!url) return;
    let live = true;
    loadLinkMeta(url).then((m) => {
      if (live && m) setLoadedMeta({ url, value: m });
    });
    return () => {
      live = false;
    };
  }, [url]);

  useEffect(() => { setShowQr(false); setCopied(false); }, [clip.id]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

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
    await s.copyText(p);
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
    await s.copyText(p);
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

  const badgeKey: DictKey =
    clip.kind === "link"
      ? (url && isVideoUrl(url) ? "badge.video" : "badge.link")
      : clip.kind === "image"
        ? "badge.image"
        : clip.kind === "color" || colorHex
          ? "badge.color"
          : clip.kind === "code"
            ? "badge.code"
            : smart.placeholders.length > 0
              ? "badge.template"
              : smart.email
                ? "badge.email"
                : smart.phone
                  ? "badge.phone"
                  : smart.path
                    ? "badge.file"
                    : smart.address
                      ? "badge.address"
                      : "badge.clip";

  const raw = clip.text ?? clip.preview;
  const dataImage = isDataImage(raw) ? raw.trim() : null;
  const svgImage = isSvgMarkup(raw) ? `data:image/svg+xml;utf8,${encodeURIComponent(raw.trim())}` : null;
  const gradient = parseGradientCss(raw);
  const BadgeIcon = clip.kind === "image" || dataImage || svgImage ? ImageIcon : colorHex || gradient ? Palette : clip.kind === "code" ? Code2 : url ? Link2 : FileText;
  const dimensions = imageDimensions(clip);

  const aiCtx: AiActionCtx = useMemo(() => ({
    url,
    colorHex,
    langLabel: lang?.label ?? null,
    email: smart.email,
    phone: smart.phone,
    hasPath: !!smart.path,
    isAddress: smart.address,
    placeholders: smart.placeholders,
    isQr: isQrPayload(clip.text ?? clip.preview),
    unitTitle: unit?.title ?? null,
    imageDataUrl: fileSrc ?? (dataImage && isRasterDataUrl(dataImage) ? dataImage : null),
  }), [url, colorHex, lang, smart, unit, fileSrc, dataImage, clip.text, clip.preview]);
  const ai = useAiAssistant(clip, aiCtx);

  useEffect(() => { ai.reset(); }, [clip.id]);
  const copyOptions = useMemo(() => {
    const text = clip.text ?? clip.preview;
    return copyOptionsFor(clip, {
      raw: text,
      url,
      linkTitle: meta?.title ?? null,
      colorHex,
      lang: lang?.lang ?? null,
      langLabel: lang?.label ?? null,
      email: smart.email,
      phone: smart.phone,
      phoneTel: smart.phone ? `tel:${smart.phone.replace(/[\s.()/\-]/g, "")}` : null,
      address: smart.address ? text.trim() : null,
      path: smart.path,
      unitValues: unit?.conversions ?? [],
      dimensions,
      dataImage: dataImage ?? svgImage,
      qrSvg,
    });
  }, [clip, url, meta?.title, colorHex, lang, smart, unit, dimensions, dataImage, svgImage, qrSvg]);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.08 } }}
      transition={{ ...soft, opacity: { duration: 0.12 } }}
      className="glass gpu clip-preview"
      role="region"
      aria-label={t("library.preview")}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="preview-toolbar">
        <span className="preview-type">
          <BadgeIcon size={13} />
          {t(badgeKey)}{clip.kind === "code" && lang ? ` · ${lang.label}` : ""}{badgeKey === "badge.clip" && unit ? ` · ${unit.title}` : ""}
        </span>
        {dimensions && <span className="preview-info-chip">{dimensions}</span>}
        <span className="preview-info-chip">{byteSize(clip)}</span>
        <div className="preview-tools">
          <Tool title={copied ? t("card.copied") : t("action.copy")} active={copied} onClick={async () => { if (await s.copyClip(clip.id)) setCopied(true); }}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? t("card.copied") : t("action.copy")}</span>
          </Tool>
          {url && (
            <Tool title={t("library.openInBrowser")} onClick={open}>
              <ExternalLink className="w-3.5 h-3.5" />
            </Tool>
          )}
          {qrTarget && (
            <Tool title={t("library.showQr")} active={showQr} onClick={() => setShowQr((v) => !v)}>
              <QrCode className="w-3.5 h-3.5" />
            </Tool>
          )}
          <div className="ai-menu-wrap">
            <Tool title={t("ai.menu")} active={ai.menuOpen} onClick={() => ai.setMenuOpen((v) => !v)}>
              <Sparkles className="w-3.5 h-3.5" />
            </Tool>
            {ai.menuOpen && (
              <AiMenu actions={ai.actions} disabledReason={ai.disabledReason} onPick={ai.pick} />
            )}
          </div>
          <Tool title={t("action.pin")} active={!!clip.is_pinned} onClick={() => s.togglePin(clip.id)}>
            <Pin className={`w-3.5 h-3.5 ${clip.is_pinned ? "fill-current" : ""}`} />
          </Tool>
          <Tool title={t("action.favorite")} active={clip.is_favorite} onClick={() => s.toggleFav(clip.id)}>
            <Star className={`w-3.5 h-3.5 ${clip.is_favorite ? "fill-current" : ""}`} />
          </Tool>
          <Tool title={t("action.close")} onClick={() => s.setPreview(null)}>
            <X className="w-3.5 h-3.5" />
          </Tool>
        </div>
      </div>

      <div className="preview-scroll nice-scroll">
      <div className="preview-content-frame">
      {meta?.embed ? (
        <div className="preview-media relative bg-black aspect-video">
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
        <video src={url} controls preload="metadata" className="preview-media preview-video" />
      ) : clip.kind === "image" && clip.image_path ? (
        fileSrc ? (
          <img src={fileSrc} alt="" className="preview-media preview-image" />
        ) : (
          <div className="preview-media bg-[#111] min-h-[180px]" />
        )
      ) : dataImage || svgImage ? (
        <img src={dataImage ?? svgImage!} alt="" draggable={false} className="preview-media preview-image" />
      ) : colorHex || gradient ? (
        <div className="preview-media preview-color" style={{ background: colorHex ?? gradient! }} />
      ) : meta?.thumbnail ? (
        <button type="button" onClick={open} className="preview-thumbnail block w-full bg-black">
          <img src={meta.thumbnail} alt="" className="preview-media w-full max-h-[280px] object-cover" />
        </button>
      ) : (
        clip.kind === "code" ? (
          <CodeView text={clip.text ?? clip.preview} lang={lang?.lang ?? null} />
        ) : (
          <pre className="preview-text nice-scroll">
            {clip.text ?? clip.preview}
          </pre>
        )
      )}

      </div>
      <div className="preview-details">
        <AiPanel ai={ai} clipId={clip.id} />
        {copyOptions.length > 0 && (
          <div className="mt-3">
            <p className="eyebrow">{t("library.copyAs")}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {copyOptions.map((o) => (
                <MiniBtn key={o.id} label={t(o.labelKey, o.params)} onClick={() => s.copyText(o.value)} />
              ))}
            </div>
          </div>
        )}
        {url && meta?.title && meta.title !== meta.host && meta.title !== "YouTube" && meta.title !== "Vimeo" && <h2 className="preview-title">{meta.title}</h2>}
        {meta?.author && <p className="preview-author">{meta.author}</p>}
        {url && (
          <button
            type="button"
            onClick={open}
            className="preview-link"
          >
            {url}
          </button>
        )}
        {showQr && qrTarget && qrSvg && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white p-3 w-fit">
            <div className="w-28 h-28 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          </div>
        )}
        {smart.placeholders.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {smart.placeholders.map((p) => (
              <MiniBtn key={p} label={p} onClick={() => s.copyText(p)} />
            ))}
          </div>
        )}
        {colorHex && <ColorDetails hex={colorHex} />}
        {(smart.email || smart.phone || smart.path || smart.address) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {smart.email && (
              <MiniBtn
                label={t("library.writeTo", { email: smart.email })}
                icon={<Mail className="w-3 h-3" />}
                onClick={() => openExternal(`mailto:${smart.email}`)}
              />
            )}
            {smart.phone && (
              <MiniBtn
                label={t("library.call", { phone: smart.phone })}
                icon={<Phone className="w-3 h-3" />}
                onClick={() => openExternal(`tel:${smart.phone!.replace(/[\s.()/\-]/g, "")}`)}
              />
            )}
            {smart.address && (
              <MiniBtn
                label={t("library.openInMaps")}
                icon={<MapPin className="w-3 h-3" />}
                onClick={() => openExternal(toMapsUrl(clip.text ?? clip.preview ?? ""))}
              />
            )}
            {smart.path && isAbsolutePath(smart.path) && (
              <MiniBtn
                label={t("library.revealInFiles")}
                icon={<FolderOpen className="w-3 h-3" />}
                onClick={() => reveal(smart.path!)}
              />
            )}
            {smart.path && isAbsolutePath(smart.path) && (
              <MiniBtn label={t("library.openFile")} onClick={() => openFile(smart.path!)} />
            )}
            {smart.path && !isAbsolutePath(smart.path) && (
              <MiniBtn label={t("library.copyPath", { path: smart.path })} onClick={() => s.copyText(smart.path!)} />
            )}
          </div>
        )}
      </div>
      </div>
      <footer className="preview-footer">
        <span><AppBadge name={clip.source_app} icon={clip.source_icon} size={16} />{prettyApp(clip.source_app)}</span>
        <span><Clock3 size={11} />{timeAgo(clip.created_at, locale)}</span>
        <span className="preview-footer-hint"><kbd>Esc</kbd> {t("library.footerClose")}</span>
      </footer>
    </motion.div>
  );
}

function CodeView({ text, lang }: { text: string; lang: string | null }) {
  const formatted = useMemo(() => formatCode(text), [text]);
  const lines = useMemo(() => tokensByLine(tokenizeCode(formatted, lang)), [formatted, lang]);
  return (
    <div className="code-block nice-scroll" role="code" aria-label="code snippet">
      {lines.map((toks, i) => (
        <div key={i} className="code-line">
          <span className="code-no" aria-hidden="true">{i + 1}</span>
          <code className="code-text">
            {toks.length === 0 ? (
              "\n"
            ) : (
              toks.map((t, j) => (
                <span key={j} className={t.kind === "plain" ? undefined : `tok-${t.kind}`}>
                  {t.text}
                </span>
              ))
            )}
          </code>
        </div>
      ))}
    </div>
  );
}

function ColorDetails({ hex }: { hex: string }) {
  const { t } = useT();
  const copyText = useBoardify((s) => s.copyText);
  const harm = useMemo(() => harmonies(hex), [hex]);
  const cWhite = contrastRatio(hex, "#FFFFFF");
  const cBlack = contrastRatio(hex, "#000000");
  const cells = [hex.toUpperCase(), harm?.comp, harm?.ana1, harm?.ana2].filter((x): x is string => !!x);
  return (
    <div className="mt-3 space-y-2.5">
      <div className="flex gap-1.5">
        {cells.map((c) => (
          <button
            key={c}
            type="button"
            title={t("library.copyColorTitle", { c })}
            onClick={() => copyText(c)}
            className="h-9 flex-1 rounded-xl ring-1 ring-white/15 hover:ring-white/40"
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {cWhite != null && (
          <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-300">
            {t("library.onWhite", { ratio: cWhite })} · {wcagBadge(cWhite)}
          </span>
        )}
        {cBlack != null && (
          <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-300">
            {t("library.onBlack", { ratio: cBlack })} · {wcagBadge(cBlack)}
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
      className="preview-mini-button"
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
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={`preview-tool ${active ? "is-active" : ""}`}
    >
      {children}
    </button>
  );
}
