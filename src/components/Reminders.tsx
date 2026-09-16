import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bell, BellRing, Check, Copy, X } from "lucide-react";
import type { Clip } from "../types";
import { cardTitle } from "../types";
import { useBoardify } from "../store";
import { useT } from "../i18n";
import { snappy, spring } from "../motion";
import {
  formatCountdown,
  formatRemindTime,
  fromLocalInputValue,
  isOverdue,
  reminderPresetIso,
  reminderTomorrowAt,
  toLocalInputValue,
} from "../reminders";

/** Strip compatte in alto alla shelf: una riga per reminder (icona + testo + countdown + X). */
export function ReminderStrip() {
  const reminders = useBoardify((s) => s.reminders);
  const copyClip = useBoardify((s) => s.copyClip);
  const clearReminder = useBoardify((s) => s.clearReminder);
  const snoozeReminder = useBoardify((s) => s.snoozeReminder);
  const setPreview = useBoardify((s) => s.setPreview);
  const { t, locale } = useT();
  const reduce = useReducedMotion();
  const [, setNow] = useState(() => Date.now());

  // Countdown vivo senza re-fetch: solo un tick locale ogni 30s.
  useEffect(() => {
    if (reminders.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [reminders.length]);

  if (reminders.length === 0) return null;
  const visible = reminders.slice(0, 5);
  const extra = reminders.length - visible.length;

  return (
    <div className="reminder-strip" role="region" aria-label={t("reminder.stripLabel")}>
      <div className="reminder-strip-head">
        <Bell className="w-3 h-3" aria-hidden="true" />
        <span>{reminders.length === 1 ? t("reminder.countOne") : t("reminder.count", { count: reminders.length })}</span>
      </div>
      <div className="reminder-strip-list">
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((clip) => (
            <ReminderRow
              key={clip.id}
              clip={clip}
              locale={locale}
              reduce={reduce}
              onCopy={() => copyClip(clip.id)}
              onOpen={() => setPreview(clip.id)}
              onSnooze={() => snoozeReminder(clip.id, 30)}
              onDismiss={() => clearReminder(clip.id)}
            />
          ))}
        </AnimatePresence>
        {extra > 0 && <p className="reminder-strip-more">+{extra}</p>}
      </div>
    </div>
  );
}

function ReminderRow({
  clip,
  locale,
  reduce,
  onCopy,
  onOpen,
  onSnooze,
  onDismiss,
}: {
  clip: Clip;
  locale: "en" | "it";
  reduce: boolean | null;
  onCopy: () => void;
  onOpen: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
}) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const due = isOverdue(clip.remind_at ?? "");
  const when = clip.remind_at ? formatCountdown(clip.remind_at, locale) : "";
  const full = clip.remind_at ? formatRemindTime(clip.remind_at, locale) : "";

  return (
    <motion.div
      layout
      initial={reduce ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6, transition: { duration: 0.14 } }}
      transition={snappy}
      data-due={due}
      className="reminder-row gpu"
    >
      <button
        type="button"
        title={full}
        onClick={async () => {
          await onCopy();
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="reminder-row-main"
      >
        {due ? <BellRing className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> : <Bell className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
        <span className="reminder-row-text">{cardTitle(clip)}</span>
        {when && (
          <span className="reminder-row-when" title={full}>
            {when}
          </span>
        )}
        <span className="reminder-row-copy" role={copied ? "status" : undefined}>
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? t("card.copied") : t("reminder.copy")}
        </span>
      </button>
      <div className="reminder-row-tools">
        <button type="button" title={t("reminder.open")} aria-label={t("reminder.open")} onClick={onOpen} className="reminder-tool">
          {t("reminder.open")}
        </button>
        <button type="button" title={t("reminder.snooze")} aria-label={t("reminder.snooze")} onClick={onSnooze} className="reminder-tool">
          +30m
        </button>
        <button type="button" title={t("reminder.dismiss")} aria-label={t("reminder.dismiss")} onClick={onDismiss} className="reminder-tool reminder-tool-x">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

/** Dialog scadenza: preset rapidi + datetime-local. Solo transform/opacity. */
export function ReminderDialog() {
  const id = useBoardify((s) => s.reminderDialogId);
  const clips = useBoardify((s) => s.clips);
  const reminders = useBoardify((s) => s.reminders);
  const setDialog = useBoardify((s) => s.setReminderDialog);
  const setReminder = useBoardify((s) => s.setReminder);
  const { t } = useT();
  const reduce = useReducedMotion();
  const clip = useMemo(
    () => clips.find((c) => c.id === id) ?? reminders.find((c) => c.id === id) ?? null,
    [clips, reminders, id]
  );
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (id) setCustom(toLocalInputValue(clip?.remind_at ?? null));
  }, [id, clip?.remind_at]);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDialog(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, setDialog]);

  const close = () => setDialog(null);
  const save = async (iso: string | null) => {
    if (!id || !iso) return;
    await setReminder(id, iso);
  };

  return (
    <AnimatePresence>
      {id && clip && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduce ? { duration: 0 } : undefined}
          className="absolute inset-0 bg-black/55 flex items-center justify-center p-5 z-30"
          onClick={close}
        >
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.14 } }}
            transition={spring}
            role="dialog"
            aria-modal="true"
            aria-label={t("reminder.dialogTitle")}
            onClick={(e) => e.stopPropagation()}
            className="glass gpu w-full max-w-[360px] rounded-2xl p-4"
          >
            <p className="font-medium text-[13.5px] mb-1">{t("reminder.dialogTitle")}</p>
            <p className="text-[12px] text-zinc-400 truncate mb-3">{cardTitle(clip)}</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <PresetBtn label={t("reminder.in10m")} onClick={() => save(reminderPresetIso(new Date(), 10))} />
              <PresetBtn label={t("reminder.in1h")} onClick={() => save(reminderPresetIso(new Date(), 60))} />
              <PresetBtn label={t("reminder.tomorrow9")} onClick={() => save(reminderTomorrowAt(new Date(), 9))} />
            </div>
            <label className="block text-[11px] text-zinc-400 mb-1">{t("reminder.custom")}</label>
            <input
              type="datetime-local"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="w-full bg-white/[0.05] rounded-xl px-3 py-2 text-[13px] outline-none ring-1 ring-white/10 [color-scheme:dark]"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={close} className="text-[12.5px] text-zinc-400 hover:text-white px-2">
                {t("action.cancel")}
              </button>
              <button
                type="button"
                onClick={() => save(fromLocalInputValue(custom))}
                disabled={!fromLocalInputValue(custom)}
                className="px-3 py-1.5 rounded-full bg-white text-black text-[12.5px] font-semibold disabled:opacity-40"
              >
                {t("reminder.save")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PresetBtn({ label, onClick }: { label: string; onClick: () => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      whileTap={reduce ? undefined : { scale: 0.95 }}
      transition={snappy}
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-full text-[12px] bg-white/[0.06] text-zinc-200 hover:text-white ring-1 ring-white/10"
    >
      {label}
    </motion.button>
  );
}

/** Banner quando una scadenza suona mentre la shelf è aperta (la notifica OS arriva da Rust). */
export function ReminderDueBanner() {
  const dueId = useBoardify((s) => s.reminderDueId);
  const reminders = useBoardify((s) => s.reminders);
  const clips = useBoardify((s) => s.clips);
  const setDue = useBoardify((s) => s.setReminderDue);
  const snooze = useBoardify((s) => s.snoozeReminder);
  // Demo browser senza backend Rust: rileva gli scaduti in locale così il
  // banner si vede anche con `npm run dev` (niente notifica OS, solo UI).
  useEffect(() => {
    const timer = setInterval(async () => {
      const st = useBoardify.getState();
      if (st.reminderDueId) return;
      const overdue = st.reminders.find((r) => r.remind_at && isOverdue(r.remind_at));
      if (!overdue) return;
      const { isTauri } = await import("../demo");
      if (!isTauri()) st.setReminderDue(overdue.id);
    }, 5000);
    return () => clearInterval(timer);
  }, []);
  const clear = useBoardify((s) => s.clearReminder);
  const copy = useBoardify((s) => s.copyClip);
  const { t } = useT();
  const reduce = useReducedMotion();
  const clip = clips.find((c) => c.id === dueId) ?? reminders.find((c) => c.id === dueId) ?? null;

  return (
    <AnimatePresence>
      {clip && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -8, transition: { duration: 0.15 } }}
          transition={snappy}
          role="alert"
          className="reminder-due gpu"
        >
          <BellRing className="w-4 h-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold">{t("reminder.dueTitle")}</p>
            <p className="text-[12px] text-zinc-300 truncate">{cardTitle(clip)}</p>
          </div>
          <button type="button" onClick={() => copy(clip.id)} className="reminder-due-btn">{t("reminder.copy")}</button>
          <button type="button" onClick={() => snooze(clip.id, 30)} className="reminder-due-btn">+30m</button>
          <button type="button" aria-label={t("reminder.dismiss")} title={t("reminder.dismiss")} onClick={() => { clear(clip.id); setDue(null); }} className="reminder-due-x">
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
