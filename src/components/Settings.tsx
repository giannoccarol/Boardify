import { useId, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowUpRight, Check, ChevronRight, Clipboard, Columns3, Command, HardDrive, Keyboard, LayoutGrid, List, LockKeyhole, Palette, RotateCcw, Search, Settings2, ShieldCheck, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useBoardify } from "../store";
import { DEFAULT_SETTINGS, type ClickAction, type ClipSize, type Locale, type Settings as Preferences } from "../settings";
import { useT, type DictKey } from "../i18n";
import { isTauri } from "../demo";
import { soft, snappy } from "../motion";
import { Brand } from "./Brand";

const PANELS = [
  { id: "appearance", icon: Palette },
  { id: "general", icon: SlidersHorizontal },
  { id: "keyboard", icon: Keyboard },
  { id: "privacy", icon: ShieldCheck },
] as const;
type Panel = typeof PANELS[number]["id"];

export function Settings() {
  const settings = useBoardify((s) => s.settings);
  const patchSettings = useBoardify((s) => s.patchSettings);
  const { t } = useT();
  const [panel, setPanel] = useState<Panel>("appearance");
  const [confirmAction, setConfirmAction] = useState<"reset" | "clear" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => patchSettings({ [key]: value } as Partial<Preferences>);
  const close = () => {
    if (isTauri()) getCurrentWindow().hide().catch(() => {});
    else useBoardify.getState().setView("shelf");
  };
  const performAction = async () => {
    setBusy(true);
    try {
      if (confirmAction === "reset") {
        patchSettings({ ...DEFAULT_SETTINGS });
        setFeedback(t("settings.resetDone"));
      } else if (confirmAction === "clear" && isTauri()) {
        await invoke("clear_history");
        await useBoardify.getState().refresh();
        setFeedback(t("settings.clearDone"));
      }
      setConfirmAction(null);
    } catch { setFeedback(t("settings.actionFailed")); }
    finally { setBusy(false); }
  };

  return (
    <div className="settings-window glass gpu">
      <aside className="settings-sidebar">
        <div className="settings-brand" data-tauri-drag-region><Brand /></div>
        <div className="settings-nav-label">{t("settings.navLabel")}</div>
        <nav aria-label={t("settings.title")} className="settings-nav">
          {PANELS.map(({ id, icon: Icon }) => (
            <button key={id} aria-current={panel === id ? "page" : undefined} onClick={() => { setPanel(id); setConfirmAction(null); setFeedback(""); }} className={`settings-nav-item ${panel === id ? "is-active" : ""}`}>
              <span className={`settings-nav-icon nav-icon-${id}`}><Icon size={16} /></span><span>{t(`settings.panel.${id}` as DictKey)}</span><ChevronRight size={13} className="nav-chevron" />
            </button>
          ))}
        </nav>
        <div className="settings-sidebar-bottom"><div className="local-label"><span className="status-dot" /> {t("settings.localLabel")}</div><span className="settings-version">{t("settings.version")} <span>v0.1.0</span></span></div>
      </aside>
      <div className="settings-main">
        <header className="settings-titlebar" data-tauri-drag-region><span>{t("settings.title")} <ChevronRight size={12} /> <strong>{t(`settings.panel.${panel}` as DictKey)}</strong></span><button onClick={close} aria-label={`${t("action.close")} ${t("settings.title")}`} className="icon-button"><X size={17} /></button></header>
        <div className="settings-scroll nice-scroll" key={panel}>
          <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={soft} className="settings-content">
            <div className="settings-heading"><span className="eyebrow">{t(`settings.panel.${panel}` as DictKey)}</span><h1>{t(`settings.panel.${panel}.desc` as DictKey)}</h1><p>{t(`settings.panel.${panel}.detail` as DictKey)}</p></div>
            {panel === "appearance" && <>
              <ShelfSample settings={settings} />
              <Section title={t("settings.shelf")} description={t("settings.shelfDesc")}>
                <Row label={t("settings.cardSize")} hint={t("settings.cardSizeHint")}><Segment label={t("settings.cardSize")} value={settings.clipSize} options={[["sm", t("settings.sizeSm")], ["md", t("settings.sizeMd")], ["lg", t("settings.sizeLg")]]} onChange={(v) => set("clipSize", v as ClipSize)} /></Row>
                <Toggle label={t("settings.collections")} hint={t("settings.collectionsHint")} checked={settings.showCollections} onChange={(v) => set("showCollections", v)} />
                <Toggle label={t("settings.typeFilters")} hint={t("settings.typeFiltersHint")} checked={settings.showFilters} onChange={(v) => set("showFilters", v)} />
              </Section>
              <Section title={t("settings.libraryView")} description={t("settings.libraryViewDesc")}>
                <div className="view-options" role="group" aria-label={t("settings.libraryView")}>
                  {([{ id: "card", title: t("settings.viewCard"), subtitle: t("settings.viewCardSub"), icon: LayoutGrid }, { id: "list", title: t("settings.viewList"), subtitle: t("settings.viewListSub"), icon: List }, { id: "board", title: t("settings.viewBoard"), subtitle: t("settings.viewBoardSub"), icon: Columns3 }] as const).map(({ id, title, subtitle, icon: Icon }) => (
                    <button className={`view-option ${settings.libraryView === id ? "is-active" : ""}`} aria-pressed={settings.libraryView === id} key={id} onClick={() => set("libraryView", id)}><span className={`view-diagram diagram-${id}`} aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</span><span className="view-option-title"><Icon size={13} />{title}{settings.libraryView === id && <Check size={13} />}</span><small>{subtitle}</small></button>
                  ))}
                </div>
              </Section>
            </>}
            {panel === "general" && <>
              <div className="settings-feature"><span className="feature-icon"><Clipboard size={25} /></span><div><strong>{t("settings.hero")}</strong><p>{t("settings.heroSub")}</p></div></div>
              <Section title={t("settings.capture")}>
                <Row label={t("settings.language")} hint={t("settings.languageHint")}><Segment label={t("settings.language")} value={settings.locale} options={[["en", "English"], ["it", "Italiano"]]} onChange={(v) => set("locale", v as Locale)} /></Row>
                <Toggle label={t("settings.autoSave")} hint={t("settings.autoSaveHint")} checked={settings.autoCapture} onChange={(v) => set("autoCapture", v)} />
                <Toggle label={t("settings.showShelf")} hint={t("settings.showShelfHint")} checked={settings.notchEnabled} onChange={(v) => set("notchEnabled", v)} />
                <Toggle label={t("settings.captureToast")} hint={t("settings.captureToastHint")} checked={settings.captureToast} onChange={(v) => set("captureToast", v)} />
              </Section>
              <Section title={t("settings.interaction")}><Row label={t("settings.dblClick")} hint={t("settings.dblClickHint")}><select aria-label={t("settings.dblClick")} className="settings-select" value={settings.clickAction} onChange={(e) => set("clickAction", e.target.value as ClickAction)}><option value="copy-hide">{t("settings.copyHide")}</option><option value="copy">{t("settings.copyOnly")}</option><option value="select">{t("settings.selectOnly")}</option></select></Row></Section>
              <div className="settings-note"><Command size={16} /><p>{t("settings.pasteNotePre")} <kbd>Ctrl</kbd> + <kbd>V</kbd> {t("settings.pasteNotePost")}</p></div>
            </>}
            {panel === "keyboard" && <>
              <div className="keyboard-feature"><span className="eyebrow">{t("settings.nextClip")}</span><Keycaps value={settings.shelfShortcut} /><p>{t("settings.nextClipSub")}</p></div>
              <Section title={t("settings.quickAccess")}><Toggle label={t("settings.globalShortcuts")} hint={t("settings.globalShortcutsHint")} checked={settings.shortcutsEnabled} onChange={(v) => set("shortcutsEnabled", v)} /><Row label={t("settings.openShelf")} hint={t("settings.openShelfHint")}><ShortcutRecorder value={settings.shelfShortcut} onChange={(v) => set("shelfShortcut", v)} /></Row></Section>
              <Section title={t("settings.allAtFingertips")}>{[[t("settings.openLibrary"), "Ctrl+Shift+L"], [t("settings.newNote"), "Ctrl+Shift+N"], [t("settings.captureClip"), "Ctrl+Shift+S"], [t("settings.colorPicker"), "Ctrl+Shift+P"], [t("settings.screenText"), "Ctrl+Shift+T"], [t("settings.copyRecent"), "Ctrl+Shift+0–9"]].map(([label, keys]) => <Row label={label} key={label}><Keycaps value={keys} /></Row>)}</Section>
            </>}
            {panel === "privacy" && <>
              <div className="privacy-feature"><span className="privacy-emblem"><LockKeyhole size={28} strokeWidth={1.6} /></span><div><span className="eyebrow">{t("settings.localFirst")}</span><h2>{t("settings.safeTitle")}</h2><p>{t("settings.safeSub")}</p></div></div>
              <Section title={t("settings.history")}><Row label={t("settings.keepUnused")} hint={t("settings.keepUnusedHint")}><select aria-label={t("settings.keepUnused")} className="settings-select" value={settings.autoDeleteDays} onChange={(e) => set("autoDeleteDays", Number(e.target.value))}><option value={0}>{t("settings.forever")}</option><option value={7}>{t("settings.days7")}</option><option value={30}>{t("settings.days30")}</option><option value={90}>{t("settings.days90")}</option></select></Row><div className="ignored-apps"><label htmlFor="ignored-apps">{t("settings.excludedApps")}</label><p>{t("settings.excludedAppsHint")}</p><textarea id="ignored-apps" value={settings.ignoredApps} onChange={(e) => set("ignoredApps", e.target.value)} rows={3} placeholder={t("settings.excludedPlaceholder")} spellCheck={false} /></div></Section>
              <div className="storage-location"><HardDrive size={17} /><div><span>{t("settings.localArchive")}</span><code>~/.local/share/boardify</code></div><LockKeyhole size={14} /></div>
              <Section title={t("settings.manageData")}><Row label={t("settings.resetPrefs")} hint={t("settings.resetPrefsHint")}><button className="secondary-button" onClick={() => { setConfirmAction("reset"); setFeedback(""); }}><RotateCcw size={14} />{t("settings.reset")}</button></Row>{isTauri() && <Row label={t("settings.clearHistory")} hint={t("settings.clearHistoryHint")}><button className="danger-button" onClick={() => { setConfirmAction("clear"); setFeedback(""); }}><Trash2 size={14} />{t("settings.clear")}</button></Row>}</Section>
              {confirmAction && <div className="settings-confirm" role="alert"><strong>{confirmAction === "reset" ? t("settings.confirmResetTitle") : t("settings.confirmClearTitle")}</strong><p>{confirmAction === "reset" ? t("settings.confirmResetMsg") : t("settings.confirmClearMsg")}</p><div><button disabled={busy} className="secondary-button" onClick={() => setConfirmAction(null)}>{t("action.cancel")}</button><button disabled={busy} className="danger-button" onClick={performAction}>{busy ? t("settings.confirming") : t("settings.confirm")}</button></div></div>}
              {feedback && <p role="status" className="settings-feedback">{feedback}</p>}
            </>}
            <footer className="settings-footer"><Check size={13} /> {t("settings.footer")}</footer>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function ShelfSample({ settings }: { settings: Preferences }) {
  const { t } = useT();
  return <div className="appearance-preview" aria-label={t("settings.previewLabel")}><div className="preview-caption"><span><span className="status-dot" /> {t("settings.previewLabel")}</span><span>{t("settings.previewHint")} <ArrowUpRight size={12} /></span></div><div className={`sample-shelf sample-${settings.clipSize}`} aria-hidden="true"><div className="sample-toolbar"><Search size={13} /><span>{t("settings.sampleSearch")}</span><LayoutGrid size={13} /><Settings2 size={13} /></div>{settings.showCollections && <div className="sample-collections"><span>{t("settings.sampleAll")} <b>12</b></span><i /><i /><i /></div>}{settings.showFilters && <div className="sample-filters">{t("settings.sampleAll")} <span>{t("kind.text")}</span><span>{t("kind.link")}</span><span>{t("kind.image")}</span></div>}<div className="sample-cards"><div className="sample-card sample-note"><span>{t("settings.sampleNote")}</span><small><Clipboard size={10} /> {t("settings.sampleNow")}</small></div><div className="sample-card sample-color"><span>#B9CDF5</span><small>{t("settings.sampleColor")}</small></div><div className="sample-card sample-art"><span>{t("settings.sampleArt")}</span><small>{t("settings.sampleRefs")}</small></div><div className="sample-card sample-code"><span>const idea =<br />&nbsp;“something great”;</span><small>{t("settings.sampleCode")}</small></div></div></div></div>;
}
function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="settings-section"><div className="section-heading"><h2>{title}</h2>{description && <p>{description}</p>}</div><div className="settings-group">{children}</div></section>;
}
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="settings-row"><div className="row-copy"><span>{label}</span>{hint && <p>{hint}</p>}</div><div className="row-control">{children}</div></div>;
}
function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return <div className="settings-row"><div className="row-copy"><span id={id}>{label}</span>{hint && <p id={`${id}-hint`}>{hint}</p>}</div><button type="button" role="switch" aria-checked={checked} aria-labelledby={id} aria-describedby={hint ? `${id}-hint` : undefined} className={`settings-switch ${checked ? "is-on" : ""}`} onClick={() => onChange(!checked)}><motion.span animate={{ x: checked ? 16 : 0 }} transition={snappy} /></button></div>;
}
function Keycaps({ value }: { value: string }) {
  return <span className="keycaps">{value.split("+").map((key, i) => <kbd key={`${key}-${i}`}>{key}</kbd>)}</span>;
}
function ShortcutRecorder({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useT();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <div className="shortcut-recorder"><button aria-label={listening ? t("settings.pressKeys") : t("settings.editShortcut", { value })} className={`shortcut-button ${listening ? "is-listening" : ""}`} onClick={() => { setListening(true); setError(null); }} onBlur={() => setListening(false)} onKeyDown={(e) => {
    if (!listening) return;
    e.preventDefault(); e.stopPropagation();
    if (e.key === "Escape") { setListening(false); return; }
    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
    const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean) as string[];
    const key = e.code === "Space" ? "Space" : /^[a-z0-9]$/i.test(e.key) || /^F([1-9]|1[0-2])$/i.test(e.key) ? e.key.toUpperCase() : null;
    if (!mods.length || !key) { setError(t("settings.shortcutError")); return; }
    setListening(false); setError(null); onChange([...mods, key].join("+"));
  }}>{listening ? <span>{t("settings.pressKeys")}</span> : <Keycaps value={value} />}</button>{error && <p role="alert">{error}</p>}</div>;
}
function Segment({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <div className="segmented-control" role="group" aria-label={label}>{options.map(([id, text]) => <button key={id} aria-pressed={value === id} className={value === id ? "is-active" : ""} onClick={() => onChange(id)}>{text}</button>)}</div>;
}
