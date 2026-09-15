import { useEffect, useId, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowUpRight, Check, ChevronRight, Clipboard, Columns3, Command, HardDrive, Keyboard, LayoutGrid, List, LockKeyhole, Palette, RefreshCw, RotateCcw, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { useBoardify } from "../store";
import { DEFAULT_SETTINGS, type AiEffort, type ClickAction, type ClipSize, type Locale, type Settings as Preferences } from "../settings";
import { AI_PROVIDERS, aiProvider, maskKey, type AiProviderDef } from "../ai/providers";
import { listProviderModels, pingAi } from "../ai/client";
import { useT, type DictKey } from "../i18n";
import { isTauri } from "../demo";
import { soft, snappy } from "../motion";
import { Brand } from "./Brand";

const PANELS = [
  { id: "appearance", icon: Palette },
  { id: "general", icon: SlidersHorizontal },
  { id: "ai", icon: Sparkles },
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
  const [aiSearch, setAiSearch] = useState("");
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [aiModelsBusy, setAiModelsBusy] = useState(false);
  const [aiTestMsg, setAiTestMsg] = useState("");
  const [aiTestBusy, setAiTestBusy] = useState(false);
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
            {panel === "ai" && <AiPanel
              settings={settings}
              set={set}
              aiSearch={aiSearch}
              setAiSearch={setAiSearch}
              aiModels={aiModels}
              setAiModels={setAiModels}
              aiModelsBusy={aiModelsBusy}
              setAiModelsBusy={setAiModelsBusy}
              aiTestMsg={aiTestMsg}
              setAiTestMsg={setAiTestMsg}
              aiTestBusy={aiTestBusy}
              setAiTestBusy={setAiTestBusy}
            />}
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

/** Pannello AI: setup (provider/modello/effort) + card con sole key, come Pi Desktop. */
function AiPanel({ settings, set, aiSearch, setAiSearch, aiModels, setAiModels, aiModelsBusy, setAiModelsBusy, aiTestMsg, setAiTestMsg, aiTestBusy, setAiTestBusy }: {
  settings: Preferences;
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  aiSearch: string; setAiSearch: (v: string) => void;
  aiModels: string[]; setAiModels: (v: string[]) => void;
  aiModelsBusy: boolean; setAiModelsBusy: (v: boolean) => void;
  aiTestMsg: string; setAiTestMsg: (v: string) => void;
  aiTestBusy: boolean; setAiTestBusy: (v: boolean) => void;
}) {
  const { t } = useT();
  const def = aiProvider(settings.aiProvider);
  const activeKey = settings.aiKeys[settings.aiProvider] ?? "";
  const suggestions = Array.from(new Set([...aiModels, ...(def?.suggestedModels ?? [])]));

  const loadModelsFor = async (providerId: string, key: string, base: string) => {
    const d = aiProvider(providerId);
    if (!d || d.oauthOnly) return;
    setAiModelsBusy(true);
    try {
      setAiModels(await listProviderModels(providerId, key, base));
    } catch (e) {
      setAiModels([]);
      setAiTestMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setAiModelsBusy(false);
    }
  };

  // Carica tutta la lista all'apertura del pannello (se usabile senza key o con key già salvata).
  useEffect(() => {
    if (def && !def.oauthOnly && (!def.keyRequired || activeKey.trim())) {
      void loadModelsFor(def.id, activeKey, settings.aiBaseUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeProvider = (id: string) => {
    setAiModels([]);
    setAiTestMsg("");
    // Mai preselezionare: l'utente sceglie dalla lista completa appena caricata.
    useBoardify.getState().patchSettings({ aiProvider: id, aiModel: "" });
    const st = useBoardify.getState().settings;
    void loadModelsFor(id, st.aiKeys[id] ?? "", st.aiBaseUrl);
  };

  const test = async () => {
    if (!def || aiTestBusy) return;
    setAiTestBusy(true);
    setAiTestMsg("");
    try {
      await pingAi({
        providerId: def.id,
        model: settings.aiModel.trim(),
        effort: "off",
        apiKey: activeKey.trim(),
        customBase: settings.aiBaseUrl,
      });
      setAiTestMsg(t("settings.aiTestOk"));
    } catch (e) {
      setAiTestMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setAiTestBusy(false);
    }
  };

  const q = aiSearch.toLowerCase().trim();
  const providers = AI_PROVIDERS.filter((p) =>
    !q || `${p.name} ${p.id} ${p.envVar ?? ""} ${p.hint}`.toLowerCase().includes(q)
  );

  return <>
    <Section title={t("settings.aiSetup")} description={t("settings.aiSetupDesc")}>
      <Toggle label={t("settings.aiEnable")} hint={t("settings.aiEnableHint")} checked={settings.aiEnabled} onChange={(v) => set("aiEnabled", v)} />
      <Row label={t("settings.aiProvider")} hint={t("settings.aiProviderHint")}>
        <select aria-label={t("settings.aiProvider")} className="settings-select" value={settings.aiProvider} onChange={(e) => changeProvider(e.target.value)}>
          {AI_PROVIDERS.map((p) => <option key={p.id} value={p.id} disabled={p.oauthOnly}>{p.name}{p.oauthOnly ? " (OAuth)" : ""}</option>)}
        </select>
      </Row>
      <Row label={t("settings.aiModel")} hint={t("settings.aiModelHint")}>
        <input
          aria-label={t("settings.aiModel")}
          className="settings-input"
          list="ai-model-list"
          value={settings.aiModel}
          onChange={(e) => set("aiModel", e.target.value)}
          placeholder={suggestions[0] ?? "…"}
          spellCheck={false}
        />
        <datalist id="ai-model-list">{suggestions.map((m) => <option key={m} value={m} />)}</datalist>
        <button className="secondary-button" onClick={() => def && void loadModelsFor(def.id, activeKey, settings.aiBaseUrl)} disabled={aiModelsBusy || !def || def.oauthOnly} title={t("settings.aiReload")} aria-label={t("settings.aiReload")}>
          <RefreshCw size={13} />
        </button>
      </Row>
      <Row label={t("settings.aiEffort")} hint={t("settings.aiEffortHint")}>
        <Segment label={t("settings.aiEffort")} value={settings.aiEffort} options={[["off", t("settings.effort.off")], ["minimal", t("settings.effort.minimal")], ["medium", t("settings.effort.medium")], ["high", t("settings.effort.high")]]} onChange={(v) => set("aiEffort", v as AiEffort)} />
      </Row>
      <Row label={t("settings.aiBaseUrl")} hint={t("settings.aiBaseUrlHint")}>
        <input aria-label={t("settings.aiBaseUrl")} className="settings-input" value={settings.aiBaseUrl} onChange={(e) => set("aiBaseUrl", e.target.value)} placeholder={def?.baseUrl || "https://…"} spellCheck={false} />
      </Row>
      <Row label={t("settings.aiTest")}>
        <button className="secondary-button" onClick={test} disabled={aiTestBusy}><Sparkles size={13} />{aiTestBusy ? t("settings.confirming") : t("settings.aiTest")}</button>
      </Row>
      {aiTestMsg && <p role="status" className="settings-feedback">{aiTestMsg}</p>}
    </Section>
    <Section title={t("settings.aiKeys")} description={t("settings.aiKeysDesc")}>
      <div className="settings-group">
        <div className="settings-row"><div className="row-control" style={{ maxWidth: "100%", flex: 1 }}><Search size={13} /><input aria-label={t("settings.aiSearch")} className="settings-input" value={aiSearch} onChange={(e) => setAiSearch(e.target.value)} placeholder={t("settings.aiSearch")} spellCheck={false} /></div></div>
        {providers.map((p) => (
          <AiProviderRow
            key={p.id}
            def={p}
            savedKey={settings.aiKeys[p.id]}
            onSave={(key) => set("aiKeys", { ...settings.aiKeys, [p.id]: key })}
            onRemove={() => {
              const next = { ...settings.aiKeys };
              delete next[p.id];
              set("aiKeys", next);
            }}
          />
        ))}
      </div>
    </Section>
    <div className="settings-note"><Sparkles size={16} /><p>{t("settings.aiPrivacy")}</p></div>
  </>;
}

function AiProviderRow({ def, savedKey, onSave, onRemove }: {
  def: AiProviderDef;
  savedKey?: string;
  onSave: (key: string) => void;
  onRemove: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const configured = !!savedKey?.trim();
  return (
    <div>
      <div className="settings-row">
        <div className="row-copy">
          <span>{def.name}</span>
          <p className={configured ? "provider-status" : "provider-hint"}>{configured ? maskKey(savedKey) : def.hint}</p>
        </div>
        <div className="row-control">
          {!def.oauthOnly && (
            <button className="secondary-button" onClick={() => setOpen((v) => !v)}>
              {configured ? t("settings.aiManage") : t("settings.aiConnect")}
            </button>
          )}
        </div>
      </div>
      {open && !def.oauthOnly && (
        <div className="settings-row">
          <div className="row-copy"><span>{def.envVar ?? def.name}</span></div>
          <div className="row-control">
            <input type="password" autoComplete="off" maxLength={500} className="settings-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("settings.aiKeyPlaceholder")} spellCheck={false} />
            <button className="secondary-button" onClick={() => { if (input.trim()) { onSave(input.trim()); setInput(""); setOpen(false); } }}>{t("settings.aiSaveKey")}</button>
            {configured && <button className="danger-button" onClick={() => { onRemove(); setOpen(false); }}>{t("settings.aiRemove")}</button>}
          </div>
        </div>
      )}
    </div>
  );
}
