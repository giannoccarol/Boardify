import { useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X } from "lucide-react";
import { useBoardify } from "../store";
import { DEFAULT_SETTINGS, type ClickAction, type ClipSize, type LibraryView, type Settings } from "../settings";
import { isTauri } from "../demo";

export function Settings() {
  const settings = useBoardify((s) => s.settings);
  const patchSettings = useBoardify((s) => s.patchSettings);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    patchSettings({ [key]: value } as Partial<Settings>);
  };

  return (
    <div className="glass gpu w-full h-full rounded-[20px] overflow-hidden flex flex-col select-none">
      <div className="flex items-center px-5 py-3.5 border-b border-white/[0.07]" data-tauri-drag-region>
        <p className="font-semibold text-[15px]">Impostazioni</p>
        <button
          onClick={() => {
            if (isTauri()) getCurrentWindow().hide().catch(() => {});
            else useBoardify.getState().setView("shelf");
          }}
          className="ml-auto w-8 h-8 rounded-full grid place-items-center text-zinc-400 hover:text-white hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto nice-scroll px-5 py-4 space-y-6 text-[13px]">
        <Section title="Notch">
          <Toggle label="Mostra lo shelf (notch)" checked={settings.notchEnabled} onChange={(v) => set("notchEnabled", v)} />
          <Toggle label="Toast dopo ogni copia" checked={settings.captureToast} onChange={(v) => set("captureToast", v)} />
          <Toggle label="Mostra le collection" checked={settings.showCollections} onChange={(v) => set("showCollections", v)} />
          <Toggle label="Mostra i filtri per tipo" checked={settings.showFilters} onChange={(v) => set("showFilters", v)} />
          <Row label="Dimensione clip">
            <Seg
              value={settings.clipSize}
              options={[
                ["sm", "S"],
                ["md", "M"],
                ["lg", "L"],
              ]}
              onChange={(v) => set("clipSize", v as ClipSize)}
            />
          </Row>
          <Row label="Doppio click / Invio">
            <select
              value={settings.clickAction}
              onChange={(e) => set("clickAction", e.target.value as ClickAction)}
              className="bg-white/[0.07] rounded-lg px-2.5 py-1.5 outline-none ring-1 ring-white/10"
            >
              <option value="copy-hide">Copia e chiudi</option>
              <option value="copy">Copia</option>
              <option value="select">Solo seleziona</option>
            </select>
          </Row>
        </Section>

        <Section title="Libreria">
          <Row label="Vista predefinita">
            <Seg
              value={settings.libraryView}
              options={[
                ["card", "Card"],
                ["list", "Lista"],
                ["board", "Board"],
              ]}
              onChange={(v) => set("libraryView", v as LibraryView)}
            />
          </Row>
        </Section>

        <Section title="Clipboard">
          <Toggle
            label="Salvataggio automatico"
            hint="Se spegni, usa Ctrl+Shift+S per catturare a mano"
            checked={settings.autoCapture}
            onChange={(v) => set("autoCapture", v)}
          />
          <Row label="Elimina clip inutilizzati dopo">
            <select
              value={String(settings.autoDeleteDays)}
              onChange={(e) => set("autoDeleteDays", Number(e.target.value))}
              className="bg-white/[0.07] rounded-lg px-2.5 py-1.5 outline-none ring-1 ring-white/10"
            >
              <option value="0">Mai</option>
              <option value="7">7 giorni</option>
              <option value="30">30 giorni</option>
              <option value="90">90 giorni</option>
            </select>
          </Row>
          <label className="block">
            <span className="text-zinc-400 text-[12px]">App da ignorare (una per riga)</span>
            <textarea
              value={settings.ignoredApps}
              onChange={(e) => set("ignoredApps", e.target.value)}
              rows={3}
              placeholder={"firefox\nslack"}
              className="mt-1 w-full bg-white/[0.06] rounded-xl px-3 py-2 outline-none ring-1 ring-white/10 text-[12.5px] resize-none"
            />
          </label>
        </Section>

        <Section title="Scorciatoie">
          <Toggle
            label="Scorciatoie globali"
            hint={`Shelf ${settings.shelfShortcut} · Ctrl+Shift+L libreria · 0–9 ultimi clip · N nota · S cattura · P colore · T testo schermo`}
            checked={settings.shortcutsEnabled}
            onChange={(v) => set("shortcutsEnabled", v)}
          />
          <Row label="Apri shelf">
            <ShortcutRecorder value={settings.shelfShortcut} onChange={(v) => set("shelfShortcut", v)} />
          </Row>
        </Section>

        <Section title="Privacy">
          <p className="text-zinc-500 text-[12.5px] leading-relaxed">
            Boardify è local-first. Niente iCloud, Apple Intelligence o Dropbox: i clip restano in ~/.local/share/boardify.
          </p>
          {isTauri() && (
            <button
              onClick={() => {
                if (confirm("Svuotare tutta la history?")) invoke("clear_history");
              }}
              className="text-red-400/90 hover:text-red-300 text-[12.5px]"
            >
              Svuota history
            </button>
          )}
          <button
            onClick={() => patchSettings({ ...DEFAULT_SETTINGS })}
            className="text-zinc-400 hover:text-white text-[12.5px]"
          >
            Ripristina predefiniti
          </button>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-[11px] uppercase tracking-[0.14em] text-zinc-500 font-semibold">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-zinc-300">{label}</span>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-zinc-200">{label}</p>
        {hint && <p className="text-[11.5px] text-zinc-500 mt-0.5">{hint}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full shrink-0 relative ${checked ? "bg-white" : "bg-white/15"}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full transition-transform ${
            checked ? "left-4.5 bg-black translate-x-4" : "left-0.5 bg-white"
          }`}
          style={{ left: checked ? 18 : 2 }}
        />
      </button>
    </div>
  );
}

function ShortcutRecorder({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => {
          setListening(true);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (!listening) return;
          e.preventDefault();
          e.stopPropagation();
          if (e.key === "Escape") {
            setListening(false);
            return;
          }
          // Solo modificatori premuti: aspetta il tasto vero.
          if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
          const mods = [
            e.ctrlKey && "Ctrl",
            e.altKey && "Alt",
            e.shiftKey && "Shift",
            e.metaKey && "Super",
          ].filter(Boolean) as string[];
          const k =
            e.key.length === 1
              ? e.key.toUpperCase()
              : /^F\d{1,2}$/i.test(e.key)
                ? e.key.toUpperCase()
                : e.key === " "
                  ? "Space"
                  : null;
          if (mods.length === 0 || !k) {
            setError("Servono modificatori + tasto (A–Z, 0–9, F1–F12, Spazio)");
            return;
          }
          setListening(false);
          onChange([...mods, k].join("+"));
        }}
        onBlur={() => setListening(false)}
        className={`px-3 py-1.5 rounded-lg text-[12.5px] font-mono ring-1 outline-none ${
          listening ? "bg-white text-black ring-white animate-pulse" : "bg-white/[0.07] text-zinc-100 ring-white/10 hover:ring-white/25"
        }`}
      >
        {listening ? "Premi i tasti…" : value}
      </button>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

function Seg({
  value,
  options,
  onChange,
}: {
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex bg-white/[0.06] rounded-full p-0.5">
      {options.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`px-2.5 py-1 rounded-full text-[12px] ${value === id ? "bg-white text-black" : "text-zinc-400"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
