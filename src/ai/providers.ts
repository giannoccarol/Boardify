/** Catalogo provider AI, specchio di pi-desktop `provider-store.js:7-28` (stessi id/nomi/hint/envVar).
 * Differenze Boardify: niente delega al CLI `pi`, solo key locali; aggiunti `ollama` e `custom`
 * (OpenAI-compatible con BaseURL libera) perché qui le chiamate HTTP sono dirette (vedi client.ts).
 * I modelli restano free-text + suggerimenti: mai enum chiusi, così i futuri modelli funzionano. */

export type AiApiStyle = "openai-chat" | "anthropic" | "gemini";

export interface AiProviderDef {
  id: string;
  name: string;
  envVar: string | null;
  hint: string;
  oauthOnly?: boolean;
  apiStyle: AiApiStyle;
  /** Base URL di default per chat + elenco modelli (sovrascrivibile da settings.aiBaseUrl). */
  baseUrl: string;
  keyRequired: boolean;
  vision: boolean;
  modelsEndpoint?: "openai" | "gemini";
  suggestedModels: string[];
}

export const AI_PROVIDERS: AiProviderDef[] = [
  { id: "openrouter", name: "OpenRouter", envVar: "OPENROUTER_API_KEY", hint: "Catalogo multi-provider", apiStyle: "openai-chat", baseUrl: "https://openrouter.ai/api/v1", keyRequired: true, vision: true, modelsEndpoint: "openai", suggestedModels: ["anthropic/claude-sonnet-4", "openai/gpt-5", "google/gemini-2.5-pro", "deepseek/deepseek-chat", "x-ai/grok-4"] },
  { id: "anthropic", name: "Anthropic", envVar: "ANTHROPIC_API_KEY", hint: "Claude", apiStyle: "anthropic", baseUrl: "https://api.anthropic.com", keyRequired: true, vision: true, suggestedModels: ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-1"] },
  { id: "openai", name: "OpenAI", envVar: "OPENAI_API_KEY", hint: "GPT e modelli OpenAI", apiStyle: "openai-chat", baseUrl: "https://api.openai.com/v1", keyRequired: true, vision: true, modelsEndpoint: "openai", suggestedModels: ["gpt-5", "gpt-5-mini", "gpt-4.1-mini", "o4-mini"] },
  { id: "google", name: "Google Gemini", envVar: "GEMINI_API_KEY", hint: "Gemini", apiStyle: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", keyRequired: true, vision: true, modelsEndpoint: "gemini", suggestedModels: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"] },
  { id: "deepseek", name: "DeepSeek", envVar: "DEEPSEEK_API_KEY", hint: "DeepSeek Chat e Reasoner", apiStyle: "openai-chat", baseUrl: "https://api.deepseek.com/v1", keyRequired: true, vision: false, modelsEndpoint: "openai", suggestedModels: ["deepseek-chat", "deepseek-reasoner"] },
  { id: "xai", name: "xAI", envVar: "XAI_API_KEY", hint: "Grok", apiStyle: "openai-chat", baseUrl: "https://api.x.ai/v1", keyRequired: true, vision: true, modelsEndpoint: "openai", suggestedModels: ["grok-4", "grok-3", "grok-3-mini"] },
  { id: "mistral", name: "Mistral", envVar: "MISTRAL_API_KEY", hint: "Modelli Mistral", apiStyle: "openai-chat", baseUrl: "https://api.mistral.ai/v1", keyRequired: true, vision: true, modelsEndpoint: "openai", suggestedModels: ["mistral-large-latest", "mistral-medium-latest", "codestral-latest"] },
  { id: "groq", name: "Groq", envVar: "GROQ_API_KEY", hint: "Inferenza Groq", apiStyle: "openai-chat", baseUrl: "https://api.groq.com/openai/v1", keyRequired: true, vision: true, modelsEndpoint: "openai", suggestedModels: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "moonshotai/kimi-k2-instruct"] },
  { id: "together", name: "Together AI", envVar: "TOGETHER_API_KEY", hint: "Catalogo Together", apiStyle: "openai-chat", baseUrl: "https://api.together.xyz/v1", keyRequired: true, vision: true, modelsEndpoint: "openai", suggestedModels: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "deepseek-ai/DeepSeek-V3"] },
  { id: "fireworks", name: "Fireworks", envVar: "FIREWORKS_API_KEY", hint: "Catalogo Fireworks", apiStyle: "openai-chat", baseUrl: "https://api.fireworks.ai/inference/v1", keyRequired: true, vision: true, modelsEndpoint: "openai", suggestedModels: ["accounts/fireworks/models/llama-v3p3-70b-instruct", "accounts/fireworks/models/deepseek-v3"] },
  { id: "cerebras", name: "Cerebras", envVar: "CEREBRAS_API_KEY", hint: "Inferenza Cerebras", apiStyle: "openai-chat", baseUrl: "https://api.cerebras.ai/v1", keyRequired: true, vision: false, modelsEndpoint: "openai", suggestedModels: ["llama-3.3-70b", "qwen-3-32b"] },
  { id: "nvidia", name: "NVIDIA NIM", envVar: "NVIDIA_API_KEY", hint: "Catalogo NVIDIA", apiStyle: "openai-chat", baseUrl: "https://integrate.api.nvidia.com/v1", keyRequired: true, vision: true, modelsEndpoint: "openai", suggestedModels: ["meta/llama-3.3-70b-instruct", "deepseek-ai/deepseek-r1"] },
  { id: "huggingface", name: "Hugging Face", envVar: "HF_TOKEN", hint: "Inference Providers", apiStyle: "openai-chat", baseUrl: "https://router.huggingface.co/v1", keyRequired: true, vision: true, modelsEndpoint: "openai", suggestedModels: ["moonshotai/Kimi-K2-Instruct", "meta-llama/Llama-3.3-70B-Instruct"] },
  { id: "kimi-coding", name: "Kimi For Coding", envVar: "KIMI_API_KEY", hint: "Kimi coding plan", apiStyle: "openai-chat", baseUrl: "https://api.moonshot.ai/v1", keyRequired: true, vision: true, modelsEndpoint: "openai", suggestedModels: ["kimi-k2-0711-preview", "moonshot-v1-8k"] },
  { id: "minimax", name: "MiniMax", envVar: "MINIMAX_API_KEY", hint: "Modelli MiniMax", apiStyle: "openai-chat", baseUrl: "https://api.minimax.io/v1", keyRequired: true, vision: false, suggestedModels: ["MiniMax-M2", "MiniMax-Text-01"] },
  { id: "opencode", name: "OpenCode Zen", envVar: "OPENCODE_API_KEY", hint: "Provider OpenCode Zen", apiStyle: "openai-chat", baseUrl: "https://opencode.ai/zen/v1", keyRequired: true, vision: true, modelsEndpoint: "openai", suggestedModels: ["big-pickle", "ascendant"] },
  { id: "opencode-go", name: "OpenCode Go", envVar: "OPENCODE_API_KEY", hint: "Provider OpenCode Go", apiStyle: "openai-chat", baseUrl: "https://opencode.ai/zen/v1", keyRequired: true, vision: true, modelsEndpoint: "openai", suggestedModels: ["big-pickle", "ascendant"] },
  { id: "radius", name: "Radius", envVar: "RADIUS_API_KEY", hint: "Modelli Radius", apiStyle: "openai-chat", baseUrl: "", keyRequired: true, vision: true, suggestedModels: [] },
  { id: "ollama", name: "Ollama (locale)", envVar: null, hint: "Modelli locali, nessuna key", apiStyle: "openai-chat", baseUrl: "http://localhost:11434/v1", keyRequired: false, vision: true, modelsEndpoint: "openai", suggestedModels: ["llama3.3", "qwen3", "gemma3", "deepseek-r1"] },
  { id: "custom", name: "Custom (OpenAI-compatibile)", envVar: null, hint: "Qualsiasi endpoint OpenAI-compatibile", apiStyle: "openai-chat", baseUrl: "", keyRequired: true, vision: true, modelsEndpoint: "openai", suggestedModels: [] },
  // OAuth-only in Pi Desktop (niente key possibile): mostrati disabilitati.
  { id: "openai-codex", name: "ChatGPT Plus / Pro", envVar: null, hint: "Abbonamento ChatGPT tramite OAuth", oauthOnly: true, apiStyle: "openai-chat", baseUrl: "", keyRequired: false, vision: false, suggestedModels: [] },
  { id: "github-copilot", name: "GitHub Copilot", envVar: null, hint: "Abbonamento Copilot tramite OAuth", oauthOnly: true, apiStyle: "openai-chat", baseUrl: "", keyRequired: false, vision: false, suggestedModels: [] },
];

export function aiProvider(id: string | null | undefined): AiProviderDef | null {
  if (!id) return null;
  return AI_PROVIDERS.find((p) => p.id === id) ?? null;
}

/** Base URL effettiva: override utente (custom) altrimenti default del preset. */
export function resolveBase(provider: AiProviderDef, customBase: string): string {
  const c = (customBase || "").trim().replace(/\/+$/, "");
  if (c) return c;
  return provider.baseUrl.replace(/\/+$/, "");
}

/** Mask stile pi-desktop `provider-store.js:54-59`: •••••••• + ultime 4. */
export function maskKey(value: string | null | undefined): string {
  if (typeof value !== "string" || !value) return "";
  if (value.startsWith("$") || value.startsWith("!")) return "configurata";
  const tail = value.slice(-4);
  return `••••••••${tail ? " " + tail : ""}`;
}
