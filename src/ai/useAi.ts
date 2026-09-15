/** Stato per menu + pannello AI dentro ClipPreview: pick → (conferma sensitive) → run → copia/salva. */
import { useMemo, useState } from "react";
import type { Clip } from "../types";
import { useBoardify } from "../store";
import { copyPlain } from "../linkActions";
import { aiProvider } from "./providers";
import { AiError, runAiAction } from "./client";
import { aiReadiness } from "./readiness";
import { actionsForClip, categorizeAction, clipInput, systemPrompt, type AiAction, type AiActionCtx } from "./prompts";
import { useT } from "../i18n";

export type AiStatus = "idle" | "confirm" | "loading" | "done" | "error";

export function useAiAssistant(clip: Clip, ctx: AiActionCtx) {
  const { t, locale } = useT();
  const settings = useBoardify((s) => s.settings);
  const categories = useBoardify((s) => s.categories);
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState<AiStatus>("idle");
  const [action, setAction] = useState<AiAction | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [textFallback, setTextFallback] = useState(false);

  const def = aiProvider(settings.aiProvider);
  const apiKey = settings.aiKeys[settings.aiProvider] ?? "";
  const { ready: aiReady, reason: disabledReason } = aiReadiness(settings, t);

  const actions = useMemo(() => {
    const list = actionsForClip(clip, ctx, locale);
    if (aiReady) list.unshift(categorizeAction(categories.map((c) => c.name), locale));
    return list;
  }, [clip, ctx, locale, aiReady, categories]);

  const reset = () => {
    setStatus("idle");
    setAction(null);
    setResult("");
    setError("");
    setCopied(false);
    setSaved(false);
    setTextFallback(false);
  };

  const run = async (a: AiAction, withoutImage = false) => {
    setAction(a);
    setStatus("loading");
    setError("");
    setResult("");
    setTextFallback(withoutImage);
    const input = `${a.instruction}\n\n---\n\n${clipInput(clip, ctx)}`;
    try {
      const out = await runAiAction({
        providerId: settings.aiProvider,
        model: settings.aiModel.trim(),
        effort: settings.aiEffort,
        apiKey: apiKey.trim(),
        customBase: settings.aiBaseUrl,
        system: systemPrompt(locale),
        user: input,
        imageDataUrl: a.needsImage && !withoutImage ? ctx.imageDataUrl : null,
      });
      setResult(out);
      setStatus("done");
    } catch (e) {
      if (e instanceof AiError && e.code === "no-vision" && ctx.imageDataUrl) {
        // Fallback come da accordo: testo/OCR invece dell'immagine.
        await run(a, true);
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  const pick = (a: AiAction) => {
    setMenuOpen(false);
    if (clip.is_sensitive) {
      setAction(a);
      setStatus("confirm");
      return;
    }
    void run(a);
  };

  const copy = async () => {
    await copyPlain(result);
    setCopied(true);
  };

  const save = async () => {
    await useBoardify.getState().insertNote(result);
    setSaved(true);
  };

  return {
    menuOpen, setMenuOpen, status, action, result, error,
    copied, saved, textFallback, actions, disabledReason, aiReady,
    providerName: def?.name ?? settings.aiProvider,
    pick, run, copy, save, reset,
  };
}
