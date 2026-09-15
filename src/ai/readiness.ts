/** AI pronta? Solo allora le categorie custom hanno senso (l'AI le assegna davvero),
 * altrimenti restano quelle automatiche. Usato dal gate del "+" e dal menu AI. */
import type { Settings } from "../settings";
import { aiProvider } from "./providers";

export interface AiReadiness {
  ready: boolean;
  reason: string;
}

export function aiReadiness(
  settings: Settings,
  t: (key: "ai.configure" | "ai.oauthOnly" | "ai.errorKey" | "ai.errorModel", vars?: Record<string, string | number>) => string,
): AiReadiness {
  const def = aiProvider(settings.aiProvider);
  if (!settings.aiEnabled) return { ready: false, reason: t("ai.configure") };
  if (!def || def.oauthOnly) return { ready: false, reason: t("ai.oauthOnly") };
  if (def.keyRequired && !settings.aiKeys[settings.aiProvider]?.trim()) {
    return { ready: false, reason: t("ai.errorKey", { provider: def.name }) };
  }
  if (!settings.aiModel.trim()) return { ready: false, reason: t("ai.errorModel") };
  return { ready: true, reason: "" };
}
