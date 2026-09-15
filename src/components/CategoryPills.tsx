import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";
import { snappy } from "../motion";
import { useT } from "../i18n";
import { useBoardify } from "../store";
import { aiReadiness } from "../ai/readiness";
import type { Category } from "../types";

interface Props {
  categories: Category[];
  active: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  layoutId: string;
}

export function CategoryPills({ categories, active, onSelect, onCreate, layoutId }: Props) {
  const { t } = useT();
  const reduce = useReducedMotion();
  const settings = useBoardify((s) => s.settings);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  // Categorie custom solo con AI pronta (è lei ad assegnarle davvero),
  // altrimenti restano quelle automatiche.
  const { ready: canCreate } = aiReadiness(settings, t);

  const historyCount = categories.find((c) => c.name === "History")?.count ?? 0;
  // Smart: compaiono solo le categorie che hanno davvero contenuto (count > 0).
  const pills = [
    { id: "all", name: "History", count: historyCount },
    ...categories
      .filter((c) => c.name !== "History" && c.count > 0)
      .map((c) => ({ id: c.name, name: c.name, count: c.count })),
  ];

  const commit = () => {
    if (name.trim()) onCreate(name.trim());
    setName("");
    setAdding(false);
  };

  return (
    <div className="category-pills flex items-center gap-1.5 overflow-x-auto no-scrollbar">
      {pills.map((p) => {
        const isOn = active === p.id;
        return (
          <motion.button
            key={p.id}
            whileTap={reduce ? undefined : { scale: 0.95 }}
            transition={snappy}
            aria-pressed={isOn}
            onClick={() => onSelect(isOn && p.id !== "all" ? "all" : p.id)}
            className={`category-pill relative shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium
              ${isOn ? "text-black" : "text-zinc-400 hover:text-white bg-white/[0.035]"}`}
          >
            {isOn && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-white shadow-[0_1px_8px_rgba(0,0,0,.25)]"
                transition={snappy}
              />
            )}
            <span className="relative z-10">{p.id === "all" ? t("pills.history") : p.name}</span>
            <span className={`pill-count relative z-10 text-[10px] tabular-nums ${isOn ? "text-black/50" : "text-zinc-500"}`}>
              {p.count}
            </span>
          </motion.button>
        );
      })}
      {canCreate && (adding ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setAdding(false);
              setName("");
            }
          }}
          placeholder={t("pills.name")}
          className="w-28 bg-white/[0.08] rounded-full px-3 py-1.5 text-[12.5px] outline-none ring-1 ring-white/15"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          title={t("pills.new")}
          className="shrink-0 w-7 h-7 rounded-full bg-white/[0.08] hover:bg-white/[0.16] grid place-items-center text-zinc-400 hover:text-white bg-white/[0.035]"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}
