/** Riconosce colori copiati: hex, rgb, hsl, nomi CSS, gradient. */

const NAMED: Record<string, string> = {
  black: "#000000",
  white: "#FFFFFF",
  red: "#FF0000",
  green: "#008000",
  blue: "#0000FF",
  yellow: "#FFFF00",
  orange: "#FFA500",
  purple: "#800080",
  pink: "#FFC0CB",
  cyan: "#00FFFF",
  magenta: "#FF00FF",
  gray: "#808080",
  grey: "#808080",
  navy: "#000080",
  teal: "#008080",
  lime: "#00FF00",
  maroon: "#800000",
  olive: "#808000",
  silver: "#C0C0C0",
  aqua: "#00FFFF",
  fuchsia: "#FF00FF",
  rebeccapurple: "#663399",
  tomato: "#FF6347",
  gold: "#FFD700",
  coral: "#FF7F50",
  salmon: "#FA8072",
  khaki: "#F0E68C",
  violet: "#EE82EE",
  indigo: "#4B0082",
  crimson: "#DC143C",
  azure: "#F0FFFF",
};

function strip(raw: string): string {
  return raw
    .trim()
    .replace(/^[`'"]+|[`'"]+$/g, "")
    .replace(/[;!]+$/g, "")
    .replace(/^\\?#/, "#")
    .trim();
}

function expandHex(h: string): string {
  let x = h.toUpperCase();
  if (!x.startsWith("#")) x = `#${x}`;
  if (x.length === 4) {
    x = `#${x[1]}${x[1]}${x[2]}${x[2]}${x[3]}${x[3]}`;
  }
  if (x.length === 5) {
    x = `#${x[1]}${x[1]}${x[2]}${x[2]}${x[3]}${x[3]}${x[4]}${x[4]}`;
  }
  if (x.length === 9) x = x.slice(0, 7);
  return x;
}

export function parseColorCss(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let t = strip(raw);
  if (/https?:\/\//i.test(t) || /^www\./i.test(t)) return null;
  if (!t || t.length > 180) {
    const m = raw.match(/#(?:[0-9a-fA-F]{3,8})\b/) || raw.match(/rgba?\([^)]+\)/i) || raw.match(/hsla?\([^)]+\)/i);
    if (!m || raw.length > 220) return null;
    t = m[0];
  }

  if (/^0x[0-9a-fA-F]{6,8}$/i.test(t)) t = `#${t.slice(2)}`;
  if (/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(t)) t = `#${t}`;

  const named = NAMED[t.toLowerCase()];
  if (named) return named;

  if (/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(t)) return expandHex(t);

  const hexIn = t.match(/#(?:[0-9a-fA-F]{3,8})\b/);
  if (hexIn && t.length < 64) return expandHex(hexIn[0]);

  if (typeof CSS !== "undefined" && CSS.supports("color", t)) {
    const skip = ["transparent", "inherit", "currentcolor", "none", "initial", "unset"];
    if (!skip.includes(t.toLowerCase())) return t;
  }
  return null;
}

export function parseGradientCss(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (t.length > 400) return null;
  if (!/gradient\(/i.test(t)) return null;
  if (typeof CSS !== "undefined" && CSS.supports("background-image", t)) return t;
  return null;
}

export function isSvgMarkup(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const t = raw.trim();
  return t.startsWith("<svg") && t.includes("</svg>");
}

export function isDataImage(raw: string | null | undefined): boolean {
  return !!raw && /^data:image\/(png|jpe?g|gif|webp|svg\+xml)/i.test(raw.trim());
}

export function clipColor(clip: {
  kind?: string;
  color_hex?: string | null;
  text?: string | null;
  preview?: string;
}): string | null {
  if (parseGradientCss(clip.text) || parseGradientCss(clip.preview)) return null;
  if (clip.color_hex) return clip.color_hex;
  return parseColorCss(clip.text) ?? parseColorCss(clip.preview);
}

export interface Rgb { r: number; g: number; b: number }

export function hexToRgb(hex: string): Rgb | null {
  const h = parseColorCss(hex);
  if (!h || h[0] !== "#" || h.length < 7) return null;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [Math.round(h * 60) % 360, Math.round(s * 100), Math.round(l * 100)];
}

export function hslToHex(h: number, s: number, l: number): string {
  s = Math.min(100, Math.max(0, s)) / 100;
  l = Math.min(100, Math.max(0, l)) / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0").toUpperCase();
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

export type ColorFmt = "hex" | "rgb" | "hsl";

export function formatColor(css: string, fmt: ColorFmt): string {
  const rgb = hexToRgb(css);
  if (!rgb) return css;
  if (fmt === "rgb") return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  if (fmt === "hsl") {
    const [h, s, l] = rgbToHsl(rgb.r, rgb.g, rgb.b);
    return `hsl(${h}, ${s}%, ${l}%)`;
  }
  const hex = parseColorCss(css)!;
  return hex.length >= 7 ? hex.slice(0, 7).toUpperCase() : hex.toUpperCase();
}

function lum({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number | null {
  const ra = hexToRgb(a), rb = hexToRgb(b);
  if (!ra || !rb) return null;
  const [l1, l2] = [lum(ra), lum(rb)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}

export function wcagBadge(ratio: number): string {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA large";
  return "Low";
}

export function harmonies(css: string): { comp: string; ana1: string; ana2: string } | null {
  const rgb = hexToRgb(css);
  if (!rgb) return null;
  const [h, s, l] = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const shift = (d: number) => hslToHex((h + d + 360) % 360, s, l);
  return { comp: shift(180), ana1: shift(-30), ana2: shift(30) };
}

export function isDarkColor(css: string): boolean {
  const hex = parseColorCss(css);
  if (!hex || hex[0] !== "#" || hex.length < 7) return true;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return true;
  return (r * 299 + g * 587 + b * 114) / 1000 < 148;
}
