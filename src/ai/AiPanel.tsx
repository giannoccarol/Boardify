import { Fragment, useMemo, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Copy, Plus, Sparkles, X } from "lucide-react";
import { useT } from "../i18n";
import { useBoardify } from "../store";
import { parseCategorySuggestions } from "./prompts";
import type { useAiAssistant } from "./useAi";

type Ai = ReturnType<typeof useAiAssistant>;

/** Box risultato inline nella preview: conferma sensitive, loading, testo, copia/salva. */
export function AiPanel({ ai, clipId, onOpenLink }: { ai: Ai; clipId: string; onOpenLink?: (url: string) => void }) {
  const { t } = useT();
  const reduce = useReducedMotion();
  if (ai.status === "idle") return null;
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14 }}
      className="ai-result"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="ai-result-head">
        <Sparkles size={13} />
        <span>{ai.action?.label ?? ai.providerName}</span>
        <button type="button" title={t("action.close")} aria-label={t("action.close")} className="preview-tool" onClick={ai.reset}>
          <X size={13} />
        </button>
      </div>

      {ai.status === "confirm" && (
        <div>
          <p className="ai-note"><strong>{t("ai.sensitiveTitle")}</strong> — {t("ai.sensitiveConfirm", { provider: ai.providerName })}</p>
          <div className="ai-result-actions">
            <button type="button" className="preview-mini-button" onClick={() => ai.action && void ai.run(ai.action)}>
              {t("ai.send")}
            </button>
            <button type="button" className="preview-mini-button" onClick={ai.reset}>
              {t("action.cancel")}
            </button>
          </div>
        </div>
      )}

      {ai.status === "loading" && <p className="ai-loading">{t("ai.running")}</p>}

      {ai.status === "done" && (
        <div>
          {ai.textFallback && <p className="ai-note">{t("ai.textFallback")}</p>}
          {ai.action?.id === "categorize" ? (
            <CategorizeChips clipId={clipId} result={ai.result} />
          ) : (
            <div className="ai-text ai-md nice-scroll">{renderAiMarkdown(ai.result, onOpenLink)}</div>
          )}
          <div className="ai-result-actions">
            <button type="button" className="preview-mini-button" onClick={() => void ai.copy()}>
              {ai.copied ? <Check size={12} /> : <Copy size={12} />}
              {ai.copied ? t("card.copied") : t("ai.copyResult")}
            </button>
            <button type="button" className="preview-mini-button" onClick={() => void ai.save()} disabled={ai.saved}>
              {ai.saved ? <Check size={12} /> : <Plus size={12} />}
              {ai.saved ? t("ai.saved") : t("ai.saveAsClip")}
            </button>
          </div>
        </div>
      )}

      {ai.status === "error" && (
        <p role="alert" className="ai-error">{t("ai.errorTitle")}: {ai.error}</p>
      )}
    </motion.div>
  );
}

/** Chip dalle categorie suggerite: creano la categoria se manca e l'assegnano al clip. */
function CategorizeChips({ clipId, result }: { clipId: string; result: string }) {
  const suggestions = useMemo(() => parseCategorySuggestions(result), [result]);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const apply = async (name: string) => {
    if (busy) return;
    setBusy(name);
    try {
      const st = useBoardify.getState();
      const cat = await st.ensureCategoryByName(name);
      if (cat) {
        await st.assignCategory(clipId, cat.id, true);
        setApplied((prev) => new Set(prev).add(name));
      }
    } catch {
      /* l'errore resta visibile nel pannello */
    } finally {
      setBusy(null);
    }
  };

  if (suggestions.length === 0) return <pre className="ai-text nice-scroll">{result}</pre>;
  return (
    <div className="ai-result-actions" style={{ marginTop: 0 }}>
      {suggestions.map((name) => {
        const done = applied.has(name);
        return (
          <button
            key={name}
            type="button"
            className="preview-mini-button"
            disabled={done || busy === name}
            onClick={() => void apply(name)}
          >
            {done ? <Check size={12} /> : busy === name ? <span>…</span> : <Plus size={12} />}
            {name}
          </button>
        );
      })}
    </div>
  );
}

/** I modelli rispondono in Markdown: lo rendiamo qui invece di mostrare il sorgente.
 * Niente dipendenze e niente HTML grezzo (React fa l'escape, i link escono via
 * onOpenLink). Sottoinsieme: titoli, liste, bold/italic/strike/code, link,
 * quote, fence, tabelle semplici, hr. Il testo semplice resta testo semplice. */
export function renderAiMarkdown(src: string, onOpenLink?: (url: string) => void): ReactNode[] {
  const out: ReactNode[] = [];
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  let bk = 0;
  const key = () => `md-${bk++}`;

  const link = (url: string, label: ReactNode, k: string) =>
    onOpenLink ? (
      <a key={k} href={url} onClick={(e) => { e.preventDefault(); onOpenLink(url); }}>{label}</a>
    ) : (
      <a key={k} href={url} target="_blank" rel="noopener noreferrer">{label}</a>
    );

  const inline = (text: string, k: string): ReactNode[] => {
    const nodes: ReactNode[] = [];
    // Code span protetti: dentro non si formatta niente.
    text.split(/(`[^`\n]+`)/g).forEach((part, pi) => {
      const ck = `${k}-c${pi}`;
      if (/^`[^`\n]+`$/.test(part)) nodes.push(<code key={ck}>{part.slice(1, -1)}</code>);
      else nodes.push(...inlineRich(part, ck));
    });
    return nodes;
  };

  const inlineRich = (text: string, k: string): ReactNode[] => {
    const re = /\[([^\]\n]+)\]\((https?:[^)\s]+)\)|(?<!\w)\*\*([^*\n]+?)\*\*(?!\w)|(?<!\w)\*([^*\n]+?)\*(?!\w)|(?<!\w)_([^_\n]+?)_(?!\w)|~~([^~\n]+?)~~|(https?:\/\/[^\s<>"')\]]+)/g;
    const nodes: ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let n = 0;
    while ((m = re.exec(text))) {
      if (m.index > last) nodes.push(text.slice(last, m.index));
      const ik = `${k}-i${n++}`;
      if (m[1] !== undefined) nodes.push(link(cleanUrl(m[2]), inline(m[1], ik), ik));
      else if (m[3] !== undefined) nodes.push(<strong key={ik}>{inline(m[3], ik)}</strong>);
      else if (m[4] !== undefined) nodes.push(<em key={ik}>{inline(m[4], ik)}</em>);
      else if (m[5] !== undefined) nodes.push(<em key={ik}>{inline(m[5], ik)}</em>);
      else if (m[6] !== undefined) nodes.push(<del key={ik}>{inline(m[6], ik)}</del>);
      else if (m[7] !== undefined) {
        const u = cleanUrl(m[7]);
        nodes.push(link(u, [u], ik));
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
  };

  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t) { i++; continue; }
    if (/^```/.test(t)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push(<pre key={key()} className="ai-md-code"><code>{buf.join("\n")}</code></pre>);
      continue;
    }
    const h = t.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      out.push(<p key={key()} className={h[1].length === 1 ? "ai-md-h1" : "ai-md-h2"}>{inline(h[2], `h${bk}`)}</p>);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { out.push(<hr key={key()} />); i++; continue; }
    if (/^>\s?/.test(t)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { buf.push(lines[i].trim().replace(/^>\s?/, "")); i++; }
      out.push(
        <blockquote key={key()}>
          {buf.map((b, bi) => (
            <Fragment key={bi}>{inline(b, `q${bk}-${bi}`)}{bi < buf.length - 1 && <br />}</Fragment>
          ))}
        </blockquote>
      );
      continue;
    }
    const next = i + 1 < lines.length ? lines[i + 1] : undefined;
    if (t.includes("|") && isTableSep(next)) {
      const head = splitRow(t);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) { rows.push(splitRow(lines[i])); i++; }
      out.push(
        <table key={key()} className="ai-md-table">
          <thead><tr>{head.map((c, ci) => <th key={ci}>{inline(c, `th${bk}-${ci}`)}</th>)}</tr></thead>
          <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, `td${bk}-${ri}-${ci}`)}</td>)}</tr>)}</tbody>
        </table>
      );
      continue;
    }
    const lm = t.match(/^([-*•]|\d{1,3}[.)])\s+(.*)$/);
    if (lm) {
      const List = /^\d/.test(lm[1]) ? "ol" : "ul";
      const ordered = List === "ol";
      const items: string[] = [];
      while (i < lines.length) {
        const m2 = lines[i].trim().match(/^([-*•]|\d{1,3}[.)])\s+(.*)$/);
        if (!m2) break;
        items.push(m2[2]);
        i++;
      }
      out.push(
        <List key={key()}>
          {items.map((c, ci) => {
            const tm = !ordered && c.match(/^\[([ xX])\]\s+(.*)$/);
            if (tm) {
              return (
                <li key={ci} className="ai-md-task">
                  <input type="checkbox" disabled checked={tm[1].toLowerCase() === "x"} aria-hidden="true" />
                  {inline(tm[2], `li${bk}-${ci}`)}
                </li>
              );
            }
            return <li key={ci}>{inline(c, `li${bk}-${ci}`)}</li>;
          })}
        </List>
      );
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i].trim(), i + 1 < lines.length ? lines[i + 1] : undefined)) {
      buf.push(lines[i].trim());
      i++;
    }
    if (buf.length === 1 && i < lines.length && /^=+$/.test(lines[i].trim())) {
      out.push(<p key={key()} className="ai-md-h1">{inline(buf[0], `st${bk}`)}</p>);
      i++;
      continue;
    }
    out.push(
      <p key={key()}>
        {buf.map((b, bi) => (
          <Fragment key={bi}>{bi > 0 && <br />}{inline(b, `p${bk}-${bi}`)}</Fragment>
        ))}
      </p>
    );
  }
  return out;
}

function isTableSep(line: string | undefined): boolean {
  return !!line && line.includes("|") && line.includes("-") && /^\s*\|?[\s:|-]+\|?\s*$/.test(line);
}

function splitRow(row: string): string[] {
  return row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

function isBlockStart(t: string, next: string | undefined): boolean {
  return /^```/.test(t)
    || /^#{1,3}\s/.test(t)
    || /^(-{3,}|\*{3,}|_{3,})$/.test(t)
    || /^>\s?/.test(t)
    || /^([-*•]|\d{1,3}[.)])\s+/.test(t)
    || (t.includes("|") && isTableSep(next));
}

/** Toglie punteggiatura finale dagli autolink, rispettando le parentesi bilanciate. */
function cleanUrl(u: string): string {
  let s = u.replace(/[.,;:!?]+$/, "");
  const opens = (s.match(/\(/g) ?? []).length;
  let closes = (s.match(/\)/g) ?? []).length;
  while (s.endsWith(")") && closes > opens) { s = s.slice(0, -1); closes--; }
  return s;
}
