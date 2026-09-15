import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Shelf } from "./components/Shelf";
import { Library } from "./components/Library";
import { CaptureBar } from "./components/CaptureBar";
import { Settings } from "./components/Settings";
import { useBoardify, initRealtime } from "./store";
import { isTauri } from "./demo";

function dismissShelfBackdrop() {
  const st = useBoardify.getState();
  if (st.noteOpen) {
    st.setNoteOpen(false);
    return;
  }
  if (st.previewId) {
    st.setPreview(null);
    return;
  }
  if (isTauri()) getCurrentWindow().hide().catch(() => {});
}

export default function BoardifyApp() {
  const view = useBoardify((s) => s.view);
  const setView = useBoardify((s) => s.setView);
  const loadSettings = useBoardify((s) => s.loadSettings);
  const preview = !isTauri();

  useEffect(() => {
    const opaque = view === "library" || view === "settings";
    const bg = opaque ? "#0c0c0e" : "transparent";
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
  }, [view]);

  useEffect(() => {
    initRealtime();
    loadSettings();
    const params = new URLSearchParams(location.search);
    const v = params.get("view");
    if (v === "library" || v === "shelf" || v === "capture" || v === "settings") setView(v);
    const shot = params.get("shot");
    if (!shot) return;
    void useBoardify.getState().refresh().then(() => {
      if (shot !== "preview") return;
      const clips = useBoardify.getState().clips;
      const id =
        clips.find((c) => /youtu|vimeo/i.test(c.text ?? c.preview))?.id ??
        clips.find((c) => c.kind === "link")?.id ??
        clips[0]?.id ??
        null;
      if (id) useBoardify.getState().setPreview(id);
    });
  }, [setView, loadSettings]);

  const stage =
    view === "library" || view === "settings"
      ? "bg-[#0c0c0e]"
      : preview
        ? "bg-[radial-gradient(120%_80%_at_50%_100%,#c5d46b_0%,#7eb6e8_45%,#9fd4f0_100%)]"
        : "bg-transparent";

  if (view === "capture") {
    return (
      <div className={`w-screen h-screen flex items-start justify-center pt-2 ${stage}`}>
        <CaptureBar />
      </div>
    );
  }

  if (view === "settings") {
    return (
      <div className={`w-screen h-screen p-4 ${stage}`}>
        <Settings />
      </div>
    );
  }

  if (view === "shelf") {
    return (
      <div
        className={`w-screen h-screen flex items-start justify-center pt-2.5 ${stage}`}
        onMouseDown={(e) => {
          if (e.target !== e.currentTarget) return;
          dismissShelfBackdrop();
        }}
      >
        <Shelf />
      </div>
    );
  }

  return (
    <div className={`w-screen h-screen p-6 ${stage}`}>
      <Library />
    </div>
  );
}
