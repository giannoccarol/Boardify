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

// Prima emerge una capsula e si tende in orizzontale (keyframe necessari
// per il cambio di direzione); poi soft gonfia la finestra con squash/stretch.
const shelfSpring: Transition = { ...soft, stiffness: 320, damping: 20 };
const shelfEmerge: Transition = {
  type: "tween", duration: 0.3, times: [0, 0.32, 1],
  ease: [[0.16, 1, 0.3, 1], [0.45, 0, 0.2, 1]],
};

export const shelfVariants: Variants = {
  hidden: { opacity: 0, y: -42, scaleX: 0.075, scaleY: 0.07 },
  emerge: {
    opacity: [0, 0.35, 1],
    y: [-42, -3, 0],
    scaleX: [0.075, 0.17, 1.035],
    scaleY: [0.07, 0.15, 0.3],
    transition: shelfEmerge,
  },
  shown: {
    opacity: 1,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    transition: {
      y: soft,
      scaleX: shelfSpring,
      scaleY: shelfSpring,
      opacity: { duration: 0.09, ease: "easeOut" },
    },
  },
  exit: { opacity: 0, y: -12, scaleX: 0.9, scaleY: 0.8, transition: { duration: 0.16 } },
};

// Una sagoma arrotondata emerge dal bordo e si fonde nella finestra
// mentre si allarga. Nessuna animazione di border-radius o blur.
export const shelfSeedVariants: Variants = {
  hidden: { opacity: 0, y: -42, scaleX: 0.7, scaleY: 0.7 },
  emerge: {
    opacity: [0, 1, 0],
    y: [-42, -3, 0],
    scaleX: [0.7, 1.15, 4],
    scaleY: [0.7, 1, 0.75],
    transition: shelfEmerge,
  },
  shown: { opacity: 0, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

// Il contenuto entra quando la superficie è già aperta: niente testo schiacciato
// nei primi frame. Il leggero ritardo accompagna la crescita della bolla.
export const shelfContentVariants: Variants = {
  hidden: { opacity: 0, y: -12 },
  emerge: { opacity: 0, y: -12, transition: { duration: 0 } },
  shown: {
    opacity: 1,
    y: 0,
    transition: { ...soft, delay: 0.065, opacity: { duration: 0.2, delay: 0.065 } },
  },
  exit: { opacity: 0, transition: { duration: 0.08 } },
};

export const shelfGleamVariants: Variants = {
  hidden: { opacity: 0, scaleX: 0.25, scaleY: 0.6 },
  emerge: { opacity: 0, scaleX: 0.25, scaleY: 0.6, transition: { duration: 0 } },
  shown: {
    opacity: [0, 0.7, 0],
    scaleX: 1,
    scaleY: 1,
    transition: { ...soft, opacity: { duration: 0.5, times: [0, 0.3, 1] } },
  },
  exit: { opacity: 0, transition: { duration: 0.08 } },
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
