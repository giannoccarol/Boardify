import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./demo";

let closePreview: (() => Promise<void>) | null = null;

/** Anche la demo percorre l'intera animazione prima di cambiare vista. */
export function registerShelfClose(handler: () => Promise<void>) {
  closePreview = handler;
  return () => {
    if (closePreview === handler) closePreview = null;
  };
}

export async function closeShelf() {
  if (isTauri()) await invoke("hide_window", { label: "shelf" });
  else await closePreview?.();
}
