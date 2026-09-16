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

// Scorrimento nativo: uno scatto di rotella attraversa circa una card.
export const shelfScroll = { wheelGain: 1.85, linePixels: 32, preciseThreshold: 50, edgeInset: 12 };

// Prima emerge una capsula e si tende in orizzontale (keyframe necessari
// per il cambio di direzione); poi soft gonfia la finestra con squash/stretch.
const shelfSpring: Transition = { ...soft, stiffness: 320, damping: 20 };
// Chiusura a specchio: la superficie si sgonfia con la stessa molla
// dell'inflate (niente tween piatto) e svanisce da barra — la pillola
// non deve mai restare visibile (sui PC senza notch galleggerebbe da sola).
const shelfDeflate: Transition = { ...shelfSpring, stiffness: 420, damping: 30 };
const shelfEmerge: Transition = {
  type: "tween", duration: 0.3, times: [0, 0.32, 1],
  ease: [[0.16, 1, 0.3, 1], [0.45, 0, 0.2, 1]],
};
const shelfRetreat: Transition = {
  type: "tween", duration: 0.3, times: [0, 0.5, 1],
  ease: [[0.55, 0, 0.75, 0.4], [0.16, 1, 0.3, 1]],
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
  collapse: {
    opacity: 1, y: 0, scaleX: 1.035, scaleY: 0.3,
    transition: {
      y: soft,
      scaleX: shelfDeflate,
      scaleY: shelfDeflate,
      opacity: { duration: 0.08, ease: "easeOut" },
    },
  },
  exit: {
    opacity: [1, 0, 0],
    y: [0, -10, -42],
    scaleX: [1.035, 0.42, 0.22],
    scaleY: [0.3, 0.2, 0.12],
    transition: shelfRetreat,
  },
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
  collapse: { opacity: 0, y: 0, scaleX: 4, scaleY: 0.75, transition: { duration: 0 } },
  // In chiusura il seed non lampeggia: la finestra svanisce da barra,
  // non c'è origine da mascherare e niente notch dietro cui ritirarsi.
  exit: { opacity: 0, transition: { duration: 0.1 } },
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
  collapse: { opacity: 0, y: -12, transition: { duration: 0.12 } },
  exit: { opacity: 0, y: -12, transition: { duration: 0 } },
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
  collapse: { opacity: 0, transition: { duration: 0.12 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/** Le superfici piccole riprendono la bolla, con corsa e tempi più brevi. */
export const menuVariants: Variants = {
  hidden: { opacity: 0, y: -8, scaleX: 0.82, scaleY: 0.55 },
  shown: {
    opacity: 1, y: 0, scaleX: 1, scaleY: 1,
    transition: { ...snappy, damping: 27, delayChildren: 0.035, staggerChildren: 0.018, opacity: { duration: 0.1 } },
  },
  exit: { opacity: 0, y: -8, scaleX: 0.86, scaleY: 0.6, transition: { duration: 0.15, ease: [0.4, 0, 1, 1] } },
};

export const menuItemVariants: Variants = {
  hidden: { opacity: 0, y: -4 },
  shown: { opacity: 1, y: 0, transition: { ...snappy, opacity: { duration: 0.1 } } },
  exit: { opacity: 0, transition: { duration: 0.08 } },
};

export const actionTrayVariants: Variants = {
  hidden: { opacity: 0, y: -6, scaleX: 0.65, scaleY: 0.75 },
  shown: { opacity: 1, y: 0, scaleX: 1, scaleY: 1, transition: { ...snappy, damping: 28, opacity: { duration: 0.1 } } },
  exit: { opacity: 0, y: -5, scaleX: 0.75, scaleY: 0.8, transition: { duration: 0.13 } },
};

export const previewVariants: Variants = {
  hidden: { opacity: 0, y: -12, scaleX: 0.94, scaleY: 0.8 },
  shown: { opacity: 1, y: 0, scaleX: 1, scaleY: 1, transition: { ...soft, damping: 27, opacity: { duration: 0.13 } } },
  exit: { opacity: 0, y: -10, scaleX: 0.96, scaleY: 0.85, transition: { duration: 0.16 } },
};

export const actionGlyphVariants: Variants = {
  hidden: { opacity: 0, scale: 0.55, rotate: -25, y: 3 },
  shown: { opacity: 1, scale: 1, rotate: 0, y: 0, transition: { ...snappy, damping: 22, opacity: { duration: 0.1 } } },
  exit: { opacity: 0, scale: 0.65, rotate: 15, y: -3, transition: { duration: 0.1 } },
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
