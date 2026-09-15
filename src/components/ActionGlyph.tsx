import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { actionGlyphVariants } from "../motion";

/** Slot fisso: il feedback cambia senza spostare icone o etichette vicine. */
export function ActionGlyph({ active, sequence = 0, children }: {
  active?: boolean;
  sequence?: number;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <span className="action-glyph" aria-hidden="true">
      <AnimatePresence initial={false}>
        <motion.span
          key={`${!!active}:${sequence}`}
          className="action-glyph-icon"
          variants={actionGlyphVariants}
          initial={reduce ? false : "hidden"}
          animate="shown"
          exit={reduce ? { opacity: 0, transition: { duration: 0 } } : "exit"}
        >
          {children}
          {active && !reduce && (
            <motion.span className="action-glyph-pulse"
              initial={{ opacity: 0.5, scale: 0.65 }}
              animate={{ opacity: 0, scale: 1.55 }}
              transition={{ duration: 0.38, ease: "easeOut" }} />
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
