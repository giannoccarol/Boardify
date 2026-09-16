import { startDrag } from "@crabnebula/tauri-plugin-drag";
import type { Clip } from "./types";
import { isTauri } from "./demo";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "avif", "tif", "tiff"]);

function cleanPath(value: string | null | undefined): string | null {
  if (!value) return null;
  let path = value.trim().replace(/^asset:\/\/localhost\//i, "");
  if (/^file:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      path = decodeURIComponent(url.pathname);
      if (url.host) path = `\\\\${url.host}${path.replace(/\//g, "\\")}`;
      else if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1).replace(/\//g, "\\");
    } catch { return null; }
  } else {
    try { path = decodeURIComponent(path); } catch { /* lascia il path originale */ }
  }
  return path || null;
}

/** Path reali passabili al drag nativo. Mantiene i backslash di Windows. */
export function clipDragPaths(clip: Clip): string[] {
  const paths = [clip.image_path, ...(clip.file_paths ?? [])]
    .map(cleanPath)
    .filter((path): path is string => !!path);
  return [...new Set(paths)];
}

/** URL RFC 8089 usato dal fallback HTML. Gestisce POSIX, drive e share Windows. */
export function filePathToUrl(path: string): string {
  const cleaned = cleanPath(path) ?? path;
  const slash = cleaned.replace(/\\/g, "/");
  let url: string;
  if (slash.startsWith("//")) url = `file:${slash}`;
  else if (/^[A-Za-z]:\//.test(slash)) url = `file:///${slash}`;
  else url = `file://${slash.startsWith("/") ? "" : "/"}${slash}`;
  return encodeURI(url).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

function extension(path: string): string {
  return path.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase() ?? "";
}

function mimeForPath(path: string): string {
  switch (extension(path)) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    case "svg": return "image/svg+xml";
    case "avif": return "image/avif";
    case "txt": return "text/plain";
    case "pdf": return "application/pdf";
    default: return "application/octet-stream";
  }
}

function dataImage(clip: Clip): string | null {
  for (const value of [clip.text, clip.preview]) {
    if (value?.trim().startsWith("data:image/")) return value.trim();
  }
  return null;
}

function fileFromDataImage(dataUrl: string): File | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const meta = dataUrl.slice(5, comma);
  const mime = meta.split(";", 1)[0];
  if (!mime.startsWith("image/")) return null;
  try {
    const payload = dataUrl.slice(comma + 1);
    const raw = meta.split(";").includes("base64") ? atob(payload) : decodeURIComponent(payload);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const ext = mime === "image/svg+xml" ? "svg" : mime.split("/")[1]?.replace("jpeg", "jpg") || "png";
    return new File([bytes], `boardify-image.${ext}`, { type: mime });
  } catch {
    return null;
  }
}

/** Popola sempre i formati web: utile nel browser e come compatibilità fra app. */
export function setClipDragData(dataTransfer: DataTransfer, clip: Clip): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData("text/plain", clip.text ?? clip.preview ?? "");

  const paths = clipDragPaths(clip);
  if (paths.length) {
    const urls = paths.map(filePathToUrl);
    dataTransfer.setData("text/uri-list", `${urls.join("\r\n")}\r\n`);
    const first = paths[0];
    const name = first.split(/[\\/]/).pop() || "boardify-file";
    dataTransfer.setData("DownloadURL", `${mimeForPath(first)}:${name}:${urls[0]}`);
  }

  // La demo e le clip data-URL non hanno un path: Chromium può comunque
  // consegnarle alle web app come un vero File.
  const inline = dataImage(clip);
  if (inline) {
    const file = fileFromDataImage(inline);
    if (file) {
      try { dataTransfer.items.add(file); } catch { /* WebView senza DataTransferItemList scrivibile */ }
    }
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** PNG piccolo per il cursore nativo: evita preview enormi con screenshot 4K. */
function dragIcon(source: HTMLElement, clip: Clip): string {
  const canvas = document.createElement("canvas");
  canvas.width = 176;
  canvas.height = 120;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataImage(clip) ?? "";

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.42)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 7;
  roundedRect(ctx, 8, 6, 160, 102, 15);
  ctx.fillStyle = "#17181b";
  ctx.fill();
  ctx.restore();

  roundedRect(ctx, 12, 10, 152, 94, 12);
  ctx.save();
  ctx.clip();
  const image = clip.kind === "image"
    ? (source.matches("img") ? source as HTMLImageElement : source.querySelector<HTMLImageElement>("img"))
    : null;
  if (image?.complete && image.naturalWidth > 0) {
    const scale = Math.max(152 / image.naturalWidth, 94 / image.naturalHeight);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    try { ctx.drawImage(image, 12 + (152 - w) / 2, 10 + (94 - h) / 2, w, h); }
    catch { ctx.fillStyle = "#25272d"; ctx.fillRect(12, 10, 152, 94); }
  } else {
    const gradient = ctx.createLinearGradient(12, 10, 164, 104);
    gradient.addColorStop(0, "#343741");
    gradient.addColorStop(1, "#17191e");
    ctx.fillStyle = gradient;
    ctx.fillRect(12, 10, 152, 94);
    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const ext = extension(clipDragPaths(clip)[0] ?? "") || "FILE";
    ctx.fillText(ext.toUpperCase().slice(0, 5), 88, 57);
  }
  ctx.restore();
  return canvas.toDataURL("image/png");
}

export function isFileDragClip(clip: Clip): boolean {
  return clipDragPaths(clip).length > 0 || !!dataImage(clip);
}

/**
 * Avvia il drag nativo per file reali. Ritorna true quando il browser deve
 * annullare il proprio drag HTML perché il sistema operativo ha preso il gesto.
 */
export function beginClipDrag(
  clip: Clip,
  dataTransfer: DataTransfer,
  source: HTMLElement,
  onFinish: () => void,
): boolean {
  setClipDragData(dataTransfer, clip);
  const paths = clipDragPaths(clip);
  if (!isTauri() || paths.length === 0) return false;

  const icon = dragIcon(source, clip);
  void startDrag({ item: paths, icon, mode: "copy" }, onFinish).catch(onFinish);
  return true;
}
