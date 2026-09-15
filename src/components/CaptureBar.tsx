import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Bell, Folder, Star, Sparkles } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import type { Clip } from "../types";
import { cardTitle } from "../types";
import { AppBadge } from "./AppBadge";
import { spring } from "../motion";
import { useBoardify } from "../store";
import { clipColor } from "../color";
import { useT } from "../i18n";

export function CaptureBar() {
  const clips = useBoardify((s) => s.clips);
  const toggleFav = useBoardify((s) => s.toggleFav);
  const refresh = useBoardify((s) => s.refresh);
  const [clip, setClip] = useState<Clip | null>(null);
  const { t } = useT();

  useEffect(() => {
    refresh();
    const un = listen("window-shown", () => refresh());
    return () => {
      un.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setClip(clips[0] ?? null);
  }, [clips]);

  if (!clip) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring}
      className="glass gpu mx-auto mt-1 h-12 w-[440px] max-w-[94vw] rounded-full flex items-center gap-2.5 px-3 select-none pointer-events-none"
    >
      {clipColor(clip) && (
        <span
          className="w-6 h-6 rounded-md shrink-0 ring-1 ring-white/25"
          style={{ background: clipColor(clip)! }}
        />
      )}
      <AppBadge name={clip.source_app} icon={clip.source_icon} size={22} />
      <p className="flex-1 min-w-0 truncate text-[13px] font-medium">{cardTitle(clip)}</p>
      <div className="flex items-center gap-0.5">
        <Mini icon={<Bell className="w-3.5 h-3.5" />} title={t("capture.reminder")} />
        <Mini icon={<Folder className="w-3.5 h-3.5" />} title={t("capture.categories")} />
        <Mini
          icon={<Star className={`w-3.5 h-3.5 ${clip.is_favorite ? "fill-current" : ""}`} />}
          title={t("capture.favorite")}
          active={clip.is_favorite}
          onClick={() => toggleFav(clip.id)}
        />
        <Mini icon={<Sparkles className="w-3.5 h-3.5" />} title={t("capture.actions")} />
      </div>
    </motion.div>
  );
}

function Mini({
  icon,
  title,
  onClick,
  active,
}: {
  icon: ReactNode;
  title: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`w-8 h-8 rounded-full grid place-items-center ${
        active ? "bg-white text-black" : "text-zinc-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      {icon}
    </button>
  );
}
