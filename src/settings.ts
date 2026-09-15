export type ClipSize = "sm" | "md" | "lg";
export type ClickAction = "copy-hide" | "copy" | "select";
export type LibraryView = "card" | "list" | "board";
export type Locale = "en" | "it";

export interface Settings {
  clipSize: ClipSize;
  clickAction: ClickAction;
  showCollections: boolean;
  showFilters: boolean;
  autoCapture: boolean;
  captureToast: boolean;
  notchEnabled: boolean;
  libraryView: LibraryView;
  autoDeleteDays: number;
  ignoredApps: string;
  shortcutsEnabled: boolean;
  shelfShortcut: string;
  locale: Locale;
}

export const DEFAULT_SETTINGS: Settings = {
  clipSize: "md",
  clickAction: "copy-hide",
  showCollections: true,
  showFilters: false,
  autoCapture: true,
  // Popup di cattura disabilitato su richiesta (master switch nel backend):
  // il toggle resta nelle Settings per riattivarlo in futuro.
  captureToast: false,
  notchEnabled: true,
  libraryView: "card",
  autoDeleteDays: 0,
  ignoredApps: "",
  shortcutsEnabled: true,
  shelfShortcut: "Ctrl+Super+V",
  locale: "en",
};

export const KIND_IDS = ["all", "text", "link", "code", "color", "image"] as const;

// Tag @tipo: alias kind (vecchi + snippet/colors/assets) e faccette smart
// (video/email/template/qrcode) che filtrano per categoria DB.
const KIND_TAGS: Record<string, string> = {
  text: "text",
  link: "link",
  code: "code",
  snippet: "code",
  color: "color",
  colors: "color",
  image: "image",
  assets: "image",
  file: "file",
};

const CATEGORY_TAGS: Record<string, string> = {
  video: "Video",
  email: "Email",
  template: "Template",
  qrcode: "QR Code",
  qr: "QR Code",
};

export function parseSearch(raw: string): {
  text: string;
  kind?: string;
  category?: string;
  app?: string;
} {
  let kind: string | undefined;
  let category: string | undefined;
  let app: string | undefined;
  const text = raw
    .replace(/@(\S+)/g, (_, tag: string) => {
      const t = tag.toLowerCase();
      if (KIND_TAGS[t]) kind = KIND_TAGS[t];
      else if (CATEGORY_TAGS[t]) category = CATEGORY_TAGS[t];
      else app = t;
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { text, kind, category, app };
}

export function formatCopy(text: string, mode: "upper" | "lower" | "cap" | "plain"): string {
  const plain = text.replace(/\u00a0/g, " ").replace(/\s+\n/g, "\n").trim();
  switch (mode) {
    case "upper":
      return plain.toUpperCase();
    case "lower":
      return plain.toLowerCase();
    case "cap":
      return plain.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    default:
      return plain;
  }
}

export function clipSizeClass(size: ClipSize, variant: "shelf" | "grid"): string {
  if (variant === "grid") {
    if (size === "sm") return "w-[144px] h-[128px]";
    if (size === "lg") return "w-[204px] h-[182px]";
    return "w-[176px] h-[158px]";
  }
  if (size === "sm") return "w-[132px] h-[96px]";
  if (size === "lg") return "w-[220px] h-[156px]";
  return "w-[184px] h-[138px]";
}

export function shelfHeight(size: ClipSize): number {
  if (size === "sm") return 248;
  if (size === "lg") return 348;
  return 292;
}
