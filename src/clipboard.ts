import type { Clip } from "./types";
import { isDataImage, isSvgMarkup } from "./color";

/** Real copy support for the browser preview, using only the clip's local data. */
export async function copyInBrowser(clip: Clip): Promise<void> {
  const text = clip.text ?? clip.preview;
  const source = isDataImage(text) ? text.trim()
    : isSvgMarkup(text) ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text.trim())}` : null;
  if (source) {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image unavailable");
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Image unavailable")), "image/png",
    ));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } else if (clip.image_path) {
    throw new Error("Open Boardify to copy this local image");
  } else {
    await navigator.clipboard.writeText(text);
  }
}
