import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Copy, Plus, Sparkles, X } from "lucide-react";
import { useT } from "../i18n";
import { useBoardify } from "../store";
import { parseCategorySuggestions } from "./prompts";
import type { useAiAssistant } from "./useAi";

type Ai = ReturnType<typeof useAiAssistant>;

/** Box risultato inline nella preview: conferma sensitive, loading, testo, copia/salva. */
export function AiPanel({ ai, clipId }: { ai: Ai; clipId: string }) {
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
            <pre className="ai-text nice-scroll">{ai.result}</pre>
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
