/** Conversioni rapide stile colori: timestamp, px/rem, °C/°F, kg/lb, km/mi. Tutto locale. */
import type { Locale } from "./settings";

export interface UnitConv {
  label: string;
  value: string;
}

export interface UnitParse {
  title: string;
  conversions: UnitConv[];
}

const r2 = (n: number) => String(Math.round(n * 100) / 100);

export function parseUnit(raw: string | null | undefined, locale: Locale = "en"): UnitParse | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t || t.length > 64 || t.includes("\n")) return null;
  const it = locale === "it";
  const L = {
    timestamp: "Timestamp",
    date: it ? "Data" : "Date",
    length: it ? "Lunghezza" : "Length",
    temp: it ? "Temperatura" : "Temperature",
    convert: it ? "Converti" : "Convert",
    weight: it ? "Peso" : "Weight",
    dist: it ? "Distanza" : "Distance",
  };

  let m = t.match(/^(\d{10}|\d{13})$/);
  if (m) {
    const ms = m[1].length === 10 ? Number(m[1]) * 1000 : Number(m[1]);
    if (!Number.isFinite(ms)) return null;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2100) return null;
    return {
      title: L.timestamp,
      conversions: [
        { label: L.date, value: d.toLocaleString(it ? "it-IT" : "en-GB") },
        { label: "ISO", value: d.toISOString() },
      ],
    };
  }

  m = t.match(/^(\d+(?:\.\d+)?)\s*px$/i);
  if (m) return { title: L.length, conversions: [{ label: "REM", value: `${r2(Number(m[1]) / 16)}rem` }] };
  m = t.match(/^(\d+(?:\.\d+)?)\s*rem$/i);
  if (m) return { title: L.length, conversions: [{ label: "PX", value: `${r2(Number(m[1]) * 16)}px` }] };

  m = t.match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([CF])$/i);
  if (m) {
    const n = Number(m[1]);
    const v = m[2].toUpperCase() === "C" ? `${r2((n * 9) / 5 + 32)}°F` : `${r2(((n - 32) * 5) / 9)}°C`;
    return { title: L.temp, conversions: [{ label: L.convert, value: v }] };
  }

  m = t.match(/^(-?\d+(?:\.\d+)?)\s*(kg|lbs?)$/i);
  if (m) {
    const n = Number(m[1]);
    const imperial = /^lb/i.test(m[2]);
    const v = imperial ? `${r2(n / 2.20462)}kg` : `${r2(n * 2.20462)}lb`;
    return { title: L.weight, conversions: [{ label: L.convert, value: v }] };
  }

  m = t.match(/^(-?\d+(?:\.\d+)?)\s*(km|mi)$/i);
  if (m) {
    const n = Number(m[1]);
    const v = m[2].toLowerCase() === "km" ? `${r2(n * 0.621371)}mi` : `${r2(n / 0.621371)}km`;
    return { title: L.dist, conversions: [{ label: L.convert, value: v }] };
  }

  return null;
}
