/** Opzioni "Copia come…" per tipo di clip: builder puri, niente UI.
 * Il chiamante (ClipPreview) passa un ctx già calcolato con gli helper
 * esistenti; ogni opzione copiata passa dal comando `copy_text`. */
import type { Clip } from "./types";
import type { DictKey } from "./i18n";
import { formatCode } from "./code";
import { formatColor, hexToRgb } from "./color";
import { toHtml, toMarkdown, toQrSvg } from "./linkActions";

export interface CopyOption {
  id: string;
  labelKey: DictKey;
  params?: Record<string, string | number>;
  value: string;
}

export interface CopyCtx {
  raw: string;
  url: string | null;
  linkTitle: string | null;
  colorHex: string | null;
  lang: string | null;
  langLabel: string | null;
  email: string | null;
  phone: string | null;
  phoneTel: string | null;
  address: string | null;
  path: string | null;
  unitValues: { label: string; value: string }[];
  dimensions: string | null;
  dataImage: string | null;
  qrSvg: string | null;
}

export function copyOptionsFor(clip: Clip, ctx: CopyCtx): CopyOption[] {
  if (clip.kind === "color" && ctx.colorHex) return colorOptions(ctx.colorHex);
  if (clip.kind === "link" && ctx.url) return linkOptions(ctx);
  if (clip.kind === "code") return codeOptions(ctx);
  if (clip.kind === "image") return imageOptions(clip, ctx);
  if (clip.kind === "file") return fileOptions(clip, ctx);
  return textOptions(ctx);
}

function colorOptions(hex: string): CopyOption[] {
  const full = formatColor(hex, "hex");
  const rgb = hexToRgb(hex);
  const out: CopyOption[] = [{ id: "hex", labelKey: "library.copyAs.hex", value: full }];
  const short = full.match(/^#([0-9A-F])\1([0-9A-F])\2([0-9A-F])\3$/);
  if (short) out.push({ id: "hex-short", labelKey: "library.copyAs.hexShort", value: `#${short[1]}${short[2]}${short[3]}` });
  if (rgb) {
    out.push({ id: "rgb", labelKey: "library.copyAs.rgb", value: formatColor(hex, "rgb") });
    out.push({ id: "rgba", labelKey: "library.copyAs.rgba", value: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)` });
    out.push({ id: "hsl", labelKey: "library.copyAs.hsl", value: formatColor(hex, "hsl") });
  }
  out.push({ id: "css-var", labelKey: "library.copyAs.cssVar", value: `--color: ${full};` });
  out.push({ id: "tailwind", labelKey: "library.copyAs.tailwind", value: `bg-[${full}]` });
  return out;
}

function linkOptions(ctx: CopyCtx): CopyOption[] {
  const url = ctx.url!;
  const out: CopyOption[] = [{ id: "url", labelKey: "library.copyAs.url", value: url }];
  out.push({ id: "markdown", labelKey: "library.copyAs.markdown", value: toMarkdown(url, ctx.linkTitle) });
  out.push({ id: "html", labelKey: "library.copyAs.html", value: toHtml(url, ctx.linkTitle) });
  if (ctx.linkTitle && ctx.linkTitle !== url) {
    out.push({ id: "title", labelKey: "library.copyAs.title", value: ctx.linkTitle });
  }
  const qr = ctx.qrSvg ?? toQrSvg(url);
  if (qr) out.push({ id: "qr-svg", labelKey: "library.copyAs.qrSvg", value: qr });
  return out;
}

function codeOptions(ctx: CopyCtx): CopyOption[] {
  const formatted = formatCode(ctx.raw);
  const out: CopyOption[] = [{ id: "original", labelKey: "library.copyAs.original", value: ctx.raw }];
  if (formatted && formatted !== ctx.raw) {
    out.push({ id: "formatted", labelKey: "library.copyAs.formatted", value: formatted });
  }
  const fenceLang = ctx.lang ?? "";
  out.push({
    id: "fenced",
    labelKey: "library.copyAs.fenced",
    params: ctx.langLabel ? { lang: ctx.langLabel } : undefined,
    value: `\`\`\`${fenceLang}\n${formatted}\n\`\`\``,
  });
  // Whitespace collassato: insicuro per Python (indentazione semantica).
  if (ctx.lang !== "py") {
    const oneLine = formatted.replace(/\s+/g, " ").trim();
    if (oneLine && oneLine !== formatted) {
      out.push({ id: "one-line", labelKey: "library.copyAs.oneLine", value: oneLine });
    }
  }
  return out;
}

function textOptions(ctx: CopyCtx): CopyOption[] {
  const out: CopyOption[] = [];
  if (ctx.email) out.push({ id: "email", labelKey: "library.copyAs.email", params: { email: ctx.email }, value: ctx.email });
  if (ctx.phone) {
    out.push({ id: "phone", labelKey: "library.copyAs.phone", params: { phone: ctx.phone }, value: ctx.phone });
    if (ctx.phoneTel && ctx.phoneTel !== ctx.phone) {
      out.push({ id: "phone-tel", labelKey: "library.copyAs.phoneTel", params: { tel: ctx.phoneTel }, value: ctx.phoneTel });
    }
  }
  if (ctx.address) out.push({ id: "address", labelKey: "library.copyAs.address", value: ctx.address });
  if (ctx.path) out.push({ id: "path", labelKey: "library.copyAs.path", value: ctx.path });
  for (const c of ctx.unitValues) {
    out.push({ id: `unit-${c.label}`, labelKey: "library.copyAs.unitValue", params: { label: c.label, value: c.value }, value: c.value });
  }
  const clean = ctx.raw.trim();
  if (clean) out.push({ id: "clean", labelKey: "library.copyAs.clean", value: clean });
  return out;
}

function imageOptions(clip: Clip, ctx: CopyCtx): CopyOption[] {
  const out: CopyOption[] = [];
  if (ctx.dataImage) out.push({ id: "data-url", labelKey: "library.copyAs.dataUrl", value: ctx.dataImage });
  if (clip.image_path) out.push({ id: "path", labelKey: "library.copyAs.path", value: clip.image_path });
  if (ctx.dimensions) out.push({ id: "dims", labelKey: "library.copyAs.dims", params: { dims: ctx.dimensions }, value: ctx.dimensions });
  return out.length > 0 ? out : textOptions(ctx);
}

function fileOptions(clip: Clip, ctx: CopyCtx): CopyOption[] {
  const paths = (clip.file_paths ?? []).filter(Boolean);
  if (paths.length === 1) {
    const p = paths[0];
    return [
      { id: "path", labelKey: "library.copyAs.path", value: p },
      { id: "uri", labelKey: "library.copyAs.uri", value: encodeURI(`file://${p.startsWith("/") ? "" : "/"}${p}`) },
      { id: "name", labelKey: "library.copyAs.name", value: baseName(p) },
      { id: "parent", labelKey: "library.copyAs.parent", value: dirName(p) },
    ];
  }
  if (paths.length > 1) {
    return [
      { id: "all-paths", labelKey: "library.copyAs.allPaths", params: { count: paths.length }, value: paths.join("\n") },
      { id: "file-names", labelKey: "library.copyAs.fileNames", value: paths.map(baseName).join("\n") },
    ];
  }
  return textOptions(ctx);
}

function baseName(p: string): string {
  return p.split(/[/\\]/).pop() || p;
}

function dirName(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i > 0 ? p.slice(0, i) : p;
}
