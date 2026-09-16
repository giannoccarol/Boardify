import type { Locale } from "./settings";

/** Preset rapidi per il dialog reminder: solo transform di date, niente OS-specific. */
export interface ReminderPreset {
  id: string;
  minutes: number | null;
  atHour?: number;
  daysAhead?: number;
}

export function reminderPresetIso(now: Date, minutes: number): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export function reminderTomorrowAt(now: Date, hour = 9): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export function isOverdue(remindAt: string, now = Date.now()): boolean {
  const t = new Date(remindAt).getTime();
  return Number.isFinite(t) && t <= now;
}

export function formatCountdown(remindAt: string, locale: Locale = "en", now = Date.now()): string {
  const t = new Date(remindAt).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = t - now;
  const it = locale === "it";
  if (diff <= 0) return it ? "adesso" : "now";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return it ? "<1 min" : "<1 min";
  if (m < 60) return it ? `tra ${m} min` : `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) {
    const rm = m % 60;
    if (rm === 0) return it ? `tra ${h} h` : `in ${h}h`;
    return it ? `tra ${h} h ${rm} min` : `in ${h}h ${rm}m`;
  }
  const d = Math.floor(h / 24);
  if (d === 1) return it ? "domani" : "tomorrow";
  if (d < 7) return it ? `tra ${d} g` : `in ${d}d`;
  try {
    return new Date(remindAt).toLocaleDateString(locale === "it" ? "it-IT" : "en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function formatRemindTime(remindAt: string, locale: Locale = "en"): string {
  try {
    const d = new Date(remindAt);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    const time = d.toLocaleTimeString(locale === "it" ? "it-IT" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (sameDay) return locale === "it" ? `oggi ${time}` : `today ${time}`;
    if (isTomorrow) return locale === "it" ? `domani ${time}` : `tomorrow ${time}`;
    return d.toLocaleString(locale === "it" ? "it-IT" : "en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return remindAt;
  }
}

/** datetime-local <-> ISO (ora locale dell'utente, niente timezone hardcodate). */
export function toLocalInputValue(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60_000);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(v: string): string | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
