import { motion, useReducedMotion } from "framer-motion";
import { useT } from "../i18n";
import type { AiAction } from "./prompts";
import { menuVariants, menuItemVariants, snappy } from "../motion";

/** Dropdown contestuale nella toolbar della preview: solo voci per il kind del clip.
 * Stesso look del menu "Copia come" (riga con icona + label, radius 16/10). */
export function AiMenu({ actions, disabledReason, onPick }: {
  actions: AiAction[];
  disabledReason: string;
  onPick: (a: AiAction) => void;
}) {
  const reduce = useReducedMotion();
  const { t } = useT();
  return (
    <motion.div
      variants={menuVariants}
      initial={reduce ? false : "hidden"}
      animate="shown"
      exit={reduce ? { opacity: 0, transition: { duration: 0 } } : "exit"}
      className="ai-menu glass gpu"
      role="menu"
      aria-label={t("ai.menu")}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="ai-menu-head">
        <span className="eyebrow">{t("ai.menu")}</span>
        {!disabledReason && <span className="ai-menu-count">{actions.length}</span>}
      </div>
      {disabledReason ? (
        <p className="ai-menu-hint">{disabledReason}</p>
      ) : (
        <div className="ai-menu-list nice-scroll">
          {actions.map((a) => (
            <motion.button key={a.id} variants={menuItemVariants} whileTap={reduce ? undefined : { scale: 0.97 }} transition={snappy} type="button" role="menuitem" className="ai-menu-item" onClick={() => onPick(a)}>
              <span className="ai-menu-text">
                <span className="ai-menu-label">{a.label}</span>
              </span>
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
