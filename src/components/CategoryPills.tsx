import { useState } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { snappy } from "../motion";
import type { Category } from "../types";

interface Props {
  categories: Category[];
  active: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  layoutId: string;
}

export function CategoryPills({ categories, active, onSelect, onCreate, layoutId }: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

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
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
      {pills.map((p) => {
        const isOn = active === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(isOn && p.id !== "all" ? "all" : p.id)}
            className={`relative shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium
              ${isOn ? "text-black" : "text-zinc-300 hover:text-white"}`}
          >
            {isOn && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-white shadow-[0_1px_8px_rgba(0,0,0,.25)]"
                transition={snappy}
              />
            )}
            <span className="relative z-10">{p.name}</span>
            <span className={`relative z-10 text-[11px] tabular-nums ${isOn ? "text-black/50" : "text-zinc-500"}`}>
              {p.count}
            </span>
          </button>
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
            if (e.key === "Escape") {
              setAdding(false);
              setName("");
            }
          }}
          placeholder="Nome…"
          className="w-28 bg-white/[0.08] rounded-full px-3 py-1.5 text-[12.5px] outline-none ring-1 ring-white/15"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          title="Nuova categoria"
          className="shrink-0 w-7 h-7 rounded-full bg-white/[0.08] hover:bg-white/[0.16] grid place-items-center text-zinc-300 hover:text-white"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
