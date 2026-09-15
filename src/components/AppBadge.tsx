import { appIdentity, normalizeApp } from "../appIdentity";
import { appColor, appInitial, prettyApp } from "../types";

const svg = (body: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`)}`;

const KNOWN: Record<string, string> = {
  boardify: "/boardify.svg",
  firefox: svg('<circle cx="16" cy="16" r="16" fill="#FF7139"/><circle cx="13" cy="15" r="7" fill="#0060DF"/>'),
  chrome: svg('<path d="M16 16 3 8.5A15 15 0 0 1 29 8.5Z" fill="#EA4335"/><path d="M16 16 29 8.5A15 15 0 0 1 16 31Z" fill="#34A853"/><path d="M16 16 16 31A15 15 0 0 1 3 8.5Z" fill="#FBBC05"/><circle cx="16" cy="16" r="7" fill="#fff"/><circle cx="16" cy="16" r="5.5" fill="#4285F4"/>'),
  chromium: svg('<circle cx="16" cy="16" r="16" fill="#4c8bf5"/><circle cx="16" cy="16" r="6" fill="#fff"/>'),
  brave: svg('<circle cx="16" cy="16" r="16" fill="#FB542B"/>'),
  vivaldi: svg('<circle cx="16" cy="16" r="16" fill="#EF3939"/>'),
  opera: svg('<circle cx="16" cy="16" r="16" fill="#FF1B2D"/>'),
  edge: svg('<circle cx="16" cy="16" r="16" fill="#0078D7"/>'),
  zen: svg('<circle cx="16" cy="16" r="16" fill="#F76B15"/>'),
  librewolf: svg('<circle cx="16" cy="16" r="16" fill="#00ACDC"/>'),
  code: svg('<rect width="32" height="32" rx="8" fill="#007ACC"/><path d="M8 16l6-7 2 2-4 5 4 5-2 2zM24 16l-6-7-2 2 4 5-4 5 2 2z" fill="#fff"/>'),
  cursor: svg('<rect width="32" height="32" rx="8" fill="#111"/><path d="M9 6l14 10-6 1-3 8z" fill="#fff"/>'),
  slack: svg('<rect width="32" height="32" rx="8" fill="#4A154B"/><circle cx="12" cy="16" r="3.2" fill="#E01E5A"/><circle cx="20" cy="16" r="3.2" fill="#2EB67D"/><circle cx="16" cy="12" r="3.2" fill="#ECB22E"/><circle cx="16" cy="20" r="3.2" fill="#36C5F0"/>'),
  discord: svg('<rect width="32" height="32" rx="8" fill="#5865F2"/>'),
  telegram: svg('<circle cx="16" cy="16" r="16" fill="#2AABEE"/><path d="M8 16l16-6-4 14-3-6z" fill="#fff"/>'),
  figma: svg('<rect width="32" height="32" rx="8" fill="#1E1E1E"/><circle cx="13" cy="10" r="4" fill="#F24E1E"/><circle cx="19" cy="10" r="4" fill="#FF7262"/><circle cx="13" cy="16" r="4" fill="#A259FF"/><circle cx="19" cy="16" r="4" fill="#1ABCFE"/><circle cx="13" cy="22" r="4" fill="#0ACF83"/>'),
  spotify: svg('<circle cx="16" cy="16" r="16" fill="#1DB954"/>'),
  kitty: svg('<rect width="32" height="32" rx="8" fill="#111"/><circle cx="12" cy="14" r="2" fill="#fff"/><circle cx="20" cy="14" r="2" fill="#fff"/>'),
  ghostty: svg('<rect width="32" height="32" rx="8" fill="#1a1a1a"/><rect x="7" y="8" width="18" height="16" rx="2" fill="#5eead4"/>'),
  alacritty: svg('<rect width="32" height="32" rx="8" fill="#EDB64C"/>'),
  nautilus: svg('<rect width="32" height="32" rx="8" fill="#4A86CF"/>'),
  dolphin: svg('<rect width="32" height="32" rx="8" fill="#3DAEE9"/>'),
  thunar: svg('<rect width="32" height="32" rx="8" fill="#1E90FF"/>'),
  obsidian: svg('<rect width="32" height="32" rx="8" fill="#7C3AED"/>'),
  gimp: svg('<rect width="32" height="32" rx="8" fill="#5C5548"/>'),
  inkscape: svg('<rect width="32" height="32" rx="8" fill="#000"/><circle cx="16" cy="16" r="8" fill="#E0E0E0"/>'),
  blender: svg('<rect width="32" height="32" rx="8" fill="#E87D0D"/>'),
  krita: svg('<rect width="32" height="32" rx="8" fill="#3E76A4"/>'),
  thunderbird: svg('<circle cx="16" cy="16" r="16" fill="#0A84FF"/>'),
  steam: svg('<circle cx="16" cy="16" r="16" fill="#171a21"/>'),
  signal: svg('<circle cx="16" cy="16" r="16" fill="#3A76F0"/>'),
  unknown: svg('<rect width="32" height="32" rx="16" fill="#3f3f46"/><rect x="10" y="8" width="12" height="16" rx="2" fill="#d4d4d8"/>'),
};

function knownAppIcon(name: string): string | null {
  const key = appIdentity(name)?.id ?? normalizeApp(name);
  return KNOWN[key] ?? null;
}

export function AppBadge({
  name,
  icon,
  size = 18,
}: {
  name: string;
  icon?: string | null;
  size?: number;
}) {
  // Le vettoriali integrate sono nitide a ogni dimensione: precedenza sull'icona
  // di runtime (favicon/.desktop spesso a 16px, sfocate se ingrandite).
  const src = knownAppIcon(name) ?? (icon && icon.length > 8 ? icon : null);
  const label = prettyApp(name);

  if (src) {
    return (
      <span
        title={label}
        className="inline-grid place-items-center rounded-full shrink-0 overflow-hidden bg-black/40 ring-1 ring-white/35 shadow-[0_1px_4px_rgba(0,0,0,.45)]"
        style={{ width: size, height: size }}
      >
        <img src={src} alt="" draggable={false} className="w-full h-full object-cover" />
      </span>
    );
  }

  return (
    <span
      title={label}
      className="inline-grid place-items-center rounded-full text-white font-bold shrink-0 ring-1 ring-white/35 shadow-[0_1px_4px_rgba(0,0,0,.45)]"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, size * 0.48),
        background: appColor(name),
      }}
    >
      {appInitial(name)}
    </span>
  );
}
