/** Client AI diretto (niente SDK, solo fetch): 3 stili di API come da catalogo providers.ts.
 * Pi Desktop delega tutto al CLI `pi` via RPC; Boardify non bundla quel binario
 * (local-first + Windows-compat), quindi le chiamate partono dalla webview.
 * Se un provider blocca il CORS browser, l'errore `network` lo segnala con hint. */

import type { AiEffort } from "../settings";
import { invoke } from "@tauri-apps/api/core";
import { aiProvider, resolveBase } from "./providers";
import { isTauri } from "../demo";

export interface AiRunParams {
  providerId: string;
  model: string;
  effort: AiEffort;
  apiKey: string;
  customBase: string;
  system: string;
  user: string;
  imageDataUrl?: string | null;
}

export class AiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const MAX_INPUT_CHARS = 12_000;
/** Stesso limite Pi Desktop (`composer.js`): resize canvas, GIF mai toccate. */
const MAX_IMAGE_EDGE = 1600;

function trunc(s: string): string {
  const t = (s || "").trim();
  if (t.length <= MAX_INPUT_CHARS) return t;
  return `${t.slice(0, MAX_INPUT_CHARS)}\n…[truncated]`;
}

export function isRasterDataUrl(u: string | null | undefined): u is string {
  return !!u && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u.trim());
}

function splitDataUrl(u: string): { mime: string; data: string } {
  const m = u.trim().match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  return { mime: m?.[1] || "image/jpeg", data: m?.[3] || "" };
}

/** Downscale via canvas (max 1600px lato lungo, JPEG 0.8); GIF invariate come in Pi. */
export function prepareImage(dataUrl: string): Promise<string> {
  const { mime } = splitDataUrl(dataUrl);
  if (/gif/i.test(mime)) return Promise.resolve(dataUrl);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
        if (scale >= 1 && /jpe?g/i.test(mime)) return resolve(dataUrl);
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.8));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function readError(res: Response): Promise<string> {
  try {
    const t = await res.text();
    if (!t) return res.statusText;
    try {
      const j = JSON.parse(t) as { error?: { message?: string } | string; message?: string };
      const m = typeof j.error === "string" ? j.error : j.error?.message ?? j.message;
      if (m) return String(m).slice(0, 300);
    } catch {
      /* non-JSON */
    }
    return t.slice(0, 300);
  } catch {
    return res.statusText;
  }
}

function statusError(status: number, detail: string): AiError {
  if (status === 401 || status === 403) return new AiError("bad-key", `Key rifiutata (${status}). ${detail}`);
  if (status === 429) return new AiError("rate-limit", `Limite raggiunto (429). ${detail}`);
  if (status === 404) return new AiError("bad-model", `Modello o endpoint non trovato (404). ${detail}`);
  return new AiError(`http-${status}`, `Errore ${status}. ${detail}`);
}

function httpError(res: Response, detail: string): AiError {
  return statusError(res.status, detail);
}

/** Errori dal proxy Rust ("HTTP 401: msg" oppure "Rete: ..."). */
function proxyError(message: string): AiError {
  const m = message.match(/^HTTP (\d+):\s?([\s\S]*)$/);
  if (m) return statusError(Number(m[1]), m[2] || "");
  if (/^Rete:/.test(message)) return new AiError("network", message);
  return new AiError("proxy", message);
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs = 90_000): Promise<unknown> {
  // Sotto Tauri si passa dal proxy Rust: niente CORS della webview.
  if (isTauri()) {
    try {
      return await invoke("ai_proxy", { url, headers, body, timeoutMs });
    } catch (e) {
      throw proxyError(e instanceof Error ? e.message : String(e));
    }
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new AiError("network", `Rete/CORS: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw httpError(res, await readError(res));
  return res.json() as Promise<unknown>;
}

async function getJson(url: string, headers: Record<string, string>, timeoutMs = 15_000): Promise<unknown> {
  if (isTauri()) {
    try {
      return await invoke("ai_proxy", { url, headers, body: null, timeoutMs });
    } catch (e) {
      throw proxyError(e instanceof Error ? e.message : String(e));
    }
  }
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new AiError("network", `Rete/CORS: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw httpError(res, await readError(res));
  return res.json() as Promise<unknown>;
}

function openAiText(data: unknown): string {
  const d = data as { choices?: { message?: { content?: string | { type?: string; text?: string }[] } }[] };
  const c = d.choices?.[0]?.message?.content;
  if (typeof c === "string") return c.trim();
  if (Array.isArray(c)) return c.map((p) => p.text ?? "").join("").trim();
  throw new AiError("bad-response", "Risposta vuota dal modello.");
}

async function runOpenAi(p: AiRunParams, base: string): Promise<string> {
  const headers: Record<string, string> = {};
  if (p.apiKey) headers.Authorization = `Bearer ${p.apiKey}`;
  if (p.providerId === "openrouter") {
    headers["HTTP-Referer"] = "https://boardify.app";
    headers["X-Title"] = "Boardify";
  }
  const userContent: unknown = p.imageDataUrl
    ? [
        { type: "text", text: trunc(p.user) },
        { type: "image_url", image_url: { url: p.imageDataUrl } },
      ]
    : trunc(p.user);
  const body: Record<string, unknown> = {
    model: p.model,
    messages: [
      { role: "system", content: p.system },
      { role: "user", content: userContent },
    ],
    temperature: 0.7,
  };
  if (p.effort !== "off") body.reasoning_effort = p.effort;
  const url = `${base}/chat/completions`;
  try {
    return openAiText(await postJson(url, headers, body));
  } catch (e) {
    // Alcuni gateway (es. OpenCode Go) rispondono 500/400 ai parametri extra:
    // riprova in forma minima prima di arrendersi.
    if (e instanceof AiError && body.reasoning_effort !== undefined && /^http-/.test(e.code)) {
      const minimal: Record<string, unknown> = { model: p.model, messages: body.messages };
      return openAiText(await postJson(url, headers, minimal));
    }
    throw e;
  }
}

function anthropicThinking(effort: AiEffort): { budget: number; max: number } | null {
  switch (effort) {
    case "minimal": return { budget: 1024, max: 8192 };
    case "medium": return { budget: 4096, max: 16384 };
    case "high": return { budget: 10000, max: 32000 };
    default: return null;
  }
}

async function runAnthropic(p: AiRunParams, base: string): Promise<string> {
  const thinking = anthropicThinking(p.effort);
  const blocks: unknown[] = [{ type: "text", text: trunc(p.user) }];
  if (p.imageDataUrl) {
    const { mime, data } = splitDataUrl(p.imageDataUrl);
    blocks.push({ type: "image", source: { type: "base64", media_type: mime, data } });
  }
  const body: Record<string, unknown> = {
    model: p.model,
    max_tokens: thinking ? thinking.max : 4096,
    system: p.system,
    messages: [{ role: "user", content: blocks }],
    temperature: thinking ? 1 : 0.7,
  };
  if (thinking) body.thinking = { type: "enabled", budget_tokens: thinking.budget };
  const data = await postJson(`${base}/v1/messages`, {
    "x-api-key": p.apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  }, body) as { content?: { type?: string; text?: string }[] };
  const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
  if (!text) throw new AiError("bad-response", "Risposta vuota dal modello.");
  return text;
}

function geminiBudget(effort: AiEffort): number | null {
  switch (effort) {
    case "minimal": return 1024;
    case "medium": return 4096;
    case "high": return 8192;
    default: return null;
  }
}

async function runGemini(p: AiRunParams, base: string): Promise<string> {
  const parts: unknown[] = [{ text: trunc(p.user) }];
  if (p.imageDataUrl) {
    const { mime, data } = splitDataUrl(p.imageDataUrl);
    parts.push({ inlineData: { mimeType: mime, data } });
  }
  const budget = geminiBudget(p.effort);
  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: p.system }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
      ...(budget != null ? { thinkingConfig: { thinkingBudget: budget } } : {}),
    },
  };
  const model = p.model.replace(/^models\//, "");
  const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(p.apiKey)}`;
  const data = await postJson(url, {}, body) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) {
    throw new AiError("blocked", `Richiesta bloccata (${data.promptFeedback.blockReason}).`);
  }
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? "").join("").trim();
  if (!text) throw new AiError("bad-response", "Risposta vuota dal modello.");
  return text;
}

export async function runAiAction(p: AiRunParams): Promise<string> {
  const def = aiProvider(p.providerId);
  if (!def) throw new AiError("no-provider", "Provider sconosciuto.");
  if (def.oauthOnly) throw new AiError("oauth-only", `${def.name} richiede OAuth da Pi, non è usabile in Boardify.`);
  if (def.keyRequired && !p.apiKey.trim()) throw new AiError("no-key", `Manca la key per ${def.name}.`);
  if (!p.model.trim()) throw new AiError("no-model", "Scegli un modello nelle impostazioni AI.");
  if (p.imageDataUrl && !def.vision) throw new AiError("no-vision", `${def.name} non supporta le immagini qui.`);
  if (!p.user.trim() && !p.imageDataUrl) throw new AiError("empty", "Niente da inviare.");
  const base = resolveBase(def, p.customBase);
  if (!base) throw new AiError("no-base", `Manca il Base URL per ${def.name}.`);
  const image = p.imageDataUrl && isRasterDataUrl(p.imageDataUrl) ? await prepareImage(p.imageDataUrl) : p.imageDataUrl;
  const params = { ...p, imageDataUrl: image };
  switch (def.apiStyle) {
    case "anthropic": return runAnthropic(params, base);
    case "gemini": return runGemini(params, base);
    default: return runOpenAi(params, base);
  }
}

/** Elenco modelli live (dove l'API lo espone) per la dropdown impostazioni.
 * Solleva AiError in caso di fallimento (key mancante, rete, ...); [] solo se
 * l'endpoint non esiste per quel provider. */
export async function listProviderModels(providerId: string, apiKey: string, customBase: string): Promise<string[]> {
  const def = aiProvider(providerId);
  if (!def || !def.modelsEndpoint || def.oauthOnly) return [];
  const base = resolveBase(def, customBase);
  if (!base) return [];
  if (def.modelsEndpoint === "gemini") {
    if (!apiKey.trim()) throw new AiError("no-key", `Manca la key per ${def.name}.`);
    const j = (await getJson(`${base}/models?key=${encodeURIComponent(apiKey.trim())}`, {})) as { models?: { name?: string }[] };
    return (j.models ?? [])
      .map((m) => (m.name ?? "").replace(/^models\//, ""))
      .filter((n) => n && !/embedding|aqa|imagen|veo/i.test(n))
      .sort();
  }
  const headers: Record<string, string> = {};
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
  const j = (await getJson(`${base}/models`, headers)) as { data?: { id?: string }[] };
  return (j.data ?? []).map((m) => m.id ?? "").filter(Boolean).sort();
}

/** Test connessione per il pulsante nelle impostazioni. */
export async function pingAi(p: Omit<AiRunParams, "system" | "user" | "imageDataUrl">): Promise<string> {
  return runAiAction({ ...p, system: "Reply with exactly: ok", user: "ping" });
}
