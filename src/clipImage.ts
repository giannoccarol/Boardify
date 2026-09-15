import { useEffect, useState } from "react";
import { isTauri } from "./demo";

const cache = new Map<string, string>();

/**
 * Data URL dell'immagine di un clip via backend. I file locali caricati con
 * convertFileSrc (asset://) non si vedono sempre nella webview (card con "?"),
 * il data: funziona ovunque. Cache per id: i file sono content-addressed.
 */
export function useClipImageSrc(id: string, hasImage: boolean): string | null {
  const [src, setSrc] = useState<string | null>(() => cache.get(id) ?? null);
  useEffect(() => {
    if (!hasImage) {
      setSrc(null);
      return;
    }
    const hit = cache.get(id);
    if (hit) {
      setSrc(hit);
      return;
    }
    if (!isTauri()) return;
    let live = true;
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const url = await invoke<string>("image_data", { id });
        cache.set(id, url);
        if (live) setSrc(url);
      } catch {
        /* resta senza anteprima invece della "?" rotta */
      }
    })();
    return () => {
      live = false;
    };
  }, [id, hasImage]);
  return src;
}
