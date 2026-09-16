import { useState, type DragEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { snappy } from "../motion";
import { useT } from "../i18n";
import { useBoardify } from "../store";

/** Tab-bar degli Space (manuali + smart): filtro, crea, elimina, drop-assign dalle card. */
export function SpaceTabs({ layoutId }: { layoutId: string }) {
  const spaces = useBoardify((s) => s.spaces);
  const spaceId = useBoardify((s) => s.spaceId);
  const setSpace = useBoardify((s) => s.setSpace);
  const createSpace = useBoardify((s) => s.createSpace);
  const deleteSpace = useBoardify((s) => s.deleteSpace);
  const assignSpace = useBoardify((s) => s.assignSpace);
  const multiSelect = useBoardify((s) => s.multiSelect);
  const clearMulti = useBoardify((s) => s.clearMulti);
  const { t } = useT();
  const reduce = useReducedMotion();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const commit = () => {
    if (name.trim()) void createSpace(name.trim());
    setName("");
    setAdding(false);
  };

  const onDrop = (spId: string, e: DragEvent) => {
    e.preventDefault();
    const clipId = e.dataTransfer.getData("text/boardify-clip");
    if (clipId) void assignSpace(clipId, spId, true);
  };

  const assignSelected = (spId: string) => {
    for (const id of multiSelect) void assignSpace(id, spId, true);
    clearMulti();
  };

  const pill = (on: boolean) =>
    `relative shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium
     ${on ? "text-black" : "text-zinc-400 hover:text-white bg-white/[0.035]"}`;

  return (
    <div className="space-tabs flex items-center gap-1.5 overflow-x-auto no-scrollbar" role="tablist" aria-label={t("spaces.label")}>
      <motion.button
        role="tab"
        aria-selected={spaceId === null}
        whileTap={reduce ? undefined : { scale: 0.95 }}
        transition={snappy}
        onClick={() => setSpace(null)}
        className={`${pill(spaceId === null)} space-all`}
      >
        {spaceId === null && (
          <motion.span layoutId={layoutId} className="absolute inset-0 rounded-full bg-white shadow-[0_1px_8px_rgba(0,0,0,.25)]" transition={snappy} />
        )}
        <span className="relative z-10">{t("spaces.all")}</span>
      </motion.button>
      {spaces.map((sp) => {
        const on = spaceId === sp.id;
        return (
          <motion.button
            key={sp.id}
            role="tab"
            aria-selected={on}
            whileTap={reduce ? undefined : { scale: 0.95 }}
            transition={snappy}
            onClick={() => setSpace(on ? null : sp.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(sp.id, e)}
            title={sp.is_smart ? t("spaces.smartHint") : t("spaces.dropHint")}
            className={`${pill(on)} space-tab`}
          >
            {on && (
              <motion.span layoutId={layoutId} className="absolute inset-0 rounded-full bg-white shadow-[0_1px_8px_rgba(0,0,0,.25)]" transition={snappy} />
            )}
            <span className="relative z-10">{sp.icon ? `${sp.icon} ` : ""}{sp.name}</span>
            <span className={`relative z-10 text-[10px] tabular-nums ${on ? "text-black/50" : "text-zinc-500"}`}>{sp.count}</span>
            {multiSelect.length > 0 && (
              <span
                role="button"
                aria-label={t("spaces.assignSelected", { count: multiSelect.length })}
                title={t("spaces.assignSelected", { count: multiSelect.length })}
                className="relative z-10 rounded-full bg-white/15 px-1.5 text-[10px]"
                onClick={(e) => { e.stopPropagation(); assignSelected(sp.id); }}
              >
                +{multiSelect.length}
              </span>
            )}
            {on && (
              <span
                role="button"
                aria-label={t("spaces.delete")}
                title={t("spaces.delete")}
                className="relative z-10 rounded-full px-1 text-black/50 hover:text-black"
                onClick={(e) => { e.stopPropagation(); void deleteSpace(sp.id); }}
              >
                <X className="w-3 h-3" />
              </span>
            )}
          </motion.button>
        );
      })}
      {adding ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setAdding(false); setName(""); }
          }}
          placeholder={t("spaces.name")}
          aria-label={t("spaces.new")}
          className="space-input w-28 shrink-0 bg-white/[0.08] rounded-full px-3 py-1.5 text-[12.5px] outline-none ring-1 ring-white/15"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          title={t("spaces.new")}
          aria-label={t("spaces.new")}
          className="space-new shrink-0 w-7 h-7 rounded-full bg-white/[0.08] hover:bg-white/[0.16] grid place-items-center text-zinc-400 hover:text-white"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
