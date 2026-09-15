/** Livelli di thinking validi per provider+modello (specchio di Pi Desktop:
 * `get_available_thinking_levels` + `syncThinkingAfterModelChange` in `models.js`).
 * Pi li chiede al runtime; qui non c'è runtime, quindi regole per famiglia:
 * - noto reasoning → off/minimal/medium/high (o il sottoinsieme valido)
 * - noto non-reasoning → solo off (l'effort non avrebbe effetto)
 * - sconosciuto → tutti (passthrough; il retry in client.ts assorbe i 500/400).
 */
import type { AiEffort } from "../settings";

const ALL: AiEffort[] = ["off", "minimal", "medium", "high"];

/** Via prefissi stile OpenRouter ("anthropic/...") e "models/..." di Gemini. */
function norm(model: string): string {
  return model.trim().toLowerCase().replace(/^[^/]+\//, "").replace(/^models\//, "");
}

export function effortLevelsFor(providerId: string, model: string): AiEffort[] {
  if (providerId === "ollama") return ["off"]; // Ollama ignora reasoning_effort
  const m = norm(model);
  if (!m) return ALL;

  // DeepSeek API: nessun effort (reasoner ragiona sempre, chat mai).
  if (m.includes("deepseek")) return ["off"];

  if (m.includes("claude") || m.includes("fable")) {
    // Thinking da Sonnet 3.7 / Opus-Sonnet-Haiku 4+ in poi.
    if (/fable|claude-(opus|sonnet|haiku)-([4-9]|\d{2,})|claude-sonnet-3-7|claude-3-7/.test(m)) return ALL;
    return ["off"];
  }

  if (m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) {
    return ["off", "medium", "high"]; // serie-o: niente "minimal"
  }
  if (m.startsWith("gpt-5") || m.startsWith("gpt-6") || m.includes("codex")) return ALL;
  if (m.startsWith("gpt-")) return ["off"]; // 4.x, 4o, 4.1, ...

  if (m.includes("gemini")) {
    // Thinking da 2.0 in poi (2.5/3.x con budget pieno).
    if (/gemini-([2-9]|\d{2,})/.test(m)) return ALL;
    return ["off"];
  }

  return ALL;
}

/** Effort effettivo: quello richiesto se valido per il modello, altrimenti off. */
export function effectiveEffort(providerId: string, model: string, effort: AiEffort): AiEffort {
  return effortLevelsFor(providerId, model).includes(effort) ? effort : "off";
}
