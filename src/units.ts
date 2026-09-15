/** Conversioni rapide stile colori: timestamp, px/rem, °C/°F, kg/lb, km/mi. Tutto locale. */

export interface UnitConv {
  label: string;
  value: string;
}

export interface UnitParse {
  title: string;
  conversions: UnitConv[];
}

const r2 = (n: number) => String(Math.round(n * 100) / 100);

export function parseUnit(raw: string | null | undefined): UnitParse | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t || t.length > 64 || t.includes("\n")) return null;

  let m = t.match(/^(\d{10}|\d{13})$/);
  if (m) {
    const ms = m[1].length === 10 ? Number(m[1]) * 1000 : Number(m[1]);
    if (!Number.isFinite(ms)) return null;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2100) return null;
    return {
      title: "Timestamp",
      conversions: [
        { label: "Data", value: d.toLocaleString("it-IT") },
        { label: "ISO", value: d.toISOString() },
      ],
    };
  }

  m = t.match(/^(\d+(?:\.\d+)?)\s*px$/i);
  if (m) return { title: "Lunghezza", conversions: [{ label: "REM", value: `${r2(Number(m[1]) / 16)}rem` }] };
  m = t.match(/^(\d+(?:\.\d+)?)\s*rem$/i);
  if (m) return { title: "Lunghezza", conversions: [{ label: "PX", value: `${r2(Number(m[1]) * 16)}px` }] };

  m = t.match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([CF])$/i);
  if (m) {
    const n = Number(m[1]);
    const v = m[2].toUpperCase() === "C" ? `${r2((n * 9) / 5 + 32)}°F` : `${r2(((n - 32) * 5) / 9)}°C`;
    return { title: "Temperatura", conversions: [{ label: "Converti", value: v }] };
  }

  m = t.match(/^(-?\d+(?:\.\d+)?)\s*(kg|lbs?)$/i);
  if (m) {
    const n = Number(m[1]);
    const imperial = /^lb/i.test(m[2]);
    const v = imperial ? `${r2(n / 2.20462)}kg` : `${r2(n * 2.20462)}lb`;
    return { title: "Peso", conversions: [{ label: "Converti", value: v }] };
  }

  m = t.match(/^(-?\d+(?:\.\d+)?)\s*(km|mi)$/i);
  if (m) {
    const n = Number(m[1]);
    const v = m[2].toLowerCase() === "km" ? `${r2(n * 0.621371)}mi` : `${r2(n / 0.621371)}km`;
    return { title: "Distanza", conversions: [{ label: "Converti", value: v }] };
  }

  return null;
}
