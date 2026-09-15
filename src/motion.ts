import type { Transition, Variants } from "framer-motion";

/** Spring da 60fps: solo transform + opacity, niente width/height/blur. */
export const spring: Transition = {
  type: "spring",
  stiffness: 480,
  damping: 34,
  mass: 0.72,
};

export const snappy: Transition = {
  type: "spring",
  stiffness: 720,
  damping: 42,
  mass: 0.52,
};

export const soft: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 36,
  mass: 0.8,
};

export const shelfVariants: Variants = {
  hidden: { opacity: 0, y: -72, scale: 0.96 },
  shown: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { ...spring, delayChildren: 0.05, staggerChildren: 0.028 },
  },
  exit: { opacity: 0, y: -24, scale: 0.98, transition: { duration: 0.16 } },
};

export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  shown: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.94, transition: { duration: 0.12 } },
};

export const overlayVariants: Variants = {
  rest: { opacity: 0, y: -6, scale: 0.92 },
  hover: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { ...snappy, staggerChildren: 0.04 },
  },
};

export function cardDelay(index: number): number {
  return Math.min(index, 10) * 0.026;
}
