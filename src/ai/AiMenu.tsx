import { motion, useReducedMotion } from "framer-motion";
import type { AiAction } from "./prompts";

/** Dropdown contestuale nella toolbar della preview: solo voci per il kind del clip. */
export function AiMenu({ actions, disabledReason, onPick }: {
  actions: AiAction[];
  disabledReason: string;
  onPick: (a: AiAction) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      className="ai-menu glass gpu"
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {disabledReason ? (
        <p className="ai-menu-hint">{disabledReason}</p>
      ) : (
        actions.map((a) => (
          <button key={a.id} type="button" role="menuitem" className="ai-menu-item" onClick={() => onPick(a)}>
            {a.label}
          </button>
        ))
      )}
    </motion.div>
  );
}
