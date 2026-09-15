import qrcode from "qrcode-generator";
import { isTauri } from "./demo";

/** Azioni link: Markdown/HTML + QR SVG. Tutto locale, zero network. */

export function toMarkdown(url: string, title?: string | null): string {
  const t = (title || url).replace(/\]/g, "\\]");
  return `[${t}](${url})`;
}

export function toHtml(url: string, title?: string | null): string {
  const t = (title || url).replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const h = url.replace(/"/g, "&quot;");
  return `<a href="${h}">${t}</a>`;
}

export async function copyPlain(text: string): Promise<void> {
  if (isTauri()) {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}

// ponytail: typeNumber 0 = auto, fallback a livelli più capienti se URL lunga
export function toQrSvg(url: string, cellSize = 4, margin = 0): string | null {
  if (!url || url.length > 2000) return null;
  try {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    return qr.createSvgTag(cellSize, margin);
  } catch {
    return null;
  }
}
