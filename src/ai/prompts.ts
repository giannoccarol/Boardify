/** Azioni AI contestuali: una voce per cosa gestita, come le categorie smart.
 * La selezione rispecchia il badge di ClipPreview (video > link > image > color >
 * code > template > email > phone > address > testo). Titoli già localizzati
 * (dizionari in i18n.ts solo per la chrome UI, non per N azioni × 2 lingue). */

import type { Clip } from "../types";
import type { Locale } from "../settings";

export interface AiActionCtx {
  url: string | null;
  colorHex: string | null;
  langLabel: string | null;
  email: string | null;
  phone: string | null;
  hasPath: boolean;
  isAddress: boolean;
  placeholders: string[];
  isQr: boolean;
  unitTitle: string | null;
  imageDataUrl: string | null;
}

export interface AiAction {
  id: string;
  label: string;
  instruction: string;
  needsImage: boolean;
}

interface Def {
  id: string;
  en: string;
  it: string;
  promptEn: string;
  promptIt: string;
  needsImage?: boolean;
}

function pick(locale: Locale, d: Def): AiAction {
  return {
    id: d.id,
    label: locale === "it" ? d.it : d.en,
    instruction: locale === "it" ? d.promptIt : d.promptEn,
    needsImage: !!d.needsImage,
  };
}

const TEXT: Def[] = [
  { id: "summarize", en: "Summarize", it: "Riassumi", promptEn: "Summarize this in 3-5 concise bullet points.", promptIt: "Riassumi in 3-5 punti essenziali." },
  { id: "key-points", en: "Key points", it: "Punti chiave", promptEn: "Extract the key points as a short list, no fluff.", promptIt: "Estrai i punti chiave in una lista breve, senza giri di parole." },
  { id: "translate", en: "Translate EN⇄IT", it: "Traduci EN⇄IT", promptEn: "Translate to Italian if the text is English, otherwise to English. Reply with the translation only.", promptIt: "Se il testo è in inglese traducilo in italiano, altrimenti in inglese. Rispondi solo con la traduzione." },
  { id: "fix-grammar", en: "Fix grammar", it: "Correggi", promptEn: "Fix grammar, spelling and punctuation. Reply with the corrected text only.", promptIt: "Correggi grammatica, ortografia e punteggiatura. Rispondi solo con il testo corretto." },
  { id: "formal", en: "Make formal", it: "Rendi formale", promptEn: "Rewrite in a formal, professional tone. Reply with the rewritten text only.", promptIt: "Riscrivi in tono formale e professionale. Rispondi solo con il testo riscritto." },
  { id: "eli5", en: "Explain simply", it: "Spiega semplice", promptEn: "Explain this in simple terms, as if to a beginner.", promptIt: "Spiega in modo semplice, come a un principiante." },
];

const EMAIL: Def[] = [
  { id: "reply-draft", en: "Draft reply", it: "Bozza risposta", promptEn: "Draft a short, polite reply to this email. Reply with the draft only.", promptIt: "Scrivi una bozza di risposta breve e cortese a questa email. Rispondi solo con la bozza." },
  { id: "email-actions", en: "Action items", it: "Azioni richieste", promptEn: "List what this email asks the recipient to do, as checkboxes.", promptIt: "Elenca cosa chiede questa email al destinatario, come checklist." },
];

const CODE: Def[] = [
  { id: "explain-code", en: "Explain code", it: "Spiega codice", promptEn: "Explain what this code does, briefly, section by section.", promptIt: "Spiega cosa fa questo codice, in breve, sezione per sezione." },
  { id: "find-bugs", en: "Find bugs", it: "Trova bug", promptEn: "Review this code for bugs, edge cases and security issues. Be concrete.", promptIt: "Revisiona questo codice: bug, casi limite e problemi di sicurezza. Sii concreto." },
  { id: "optimize", en: "Optimize", it: "Ottimizza", promptEn: "Suggest a faster or cleaner version of this code, with a short explanation.", promptIt: "Suggerisci una versione più veloce o pulita di questo codice, con breve spiegazione." },
  { id: "add-comments", en: "Add comments", it: "Aggiungi commenti", promptEn: "Return the same code with clear, concise comments added.", promptIt: "Restituisci lo stesso codice con commenti chiari e concisi." },
  { id: "gen-tests", en: "Generate tests", it: "Genera test", promptEn: "Generate unit tests for this code in the same language.", promptIt: "Genera unit test per questo codice, nello stesso linguaggio." },
];

const LINK: Def[] = [
  { id: "summarize-link", en: "Summarize link", it: "Riassumi link", promptEn: "Summarize what this link likely points to (from URL and title). State clearly that you did not fetch the page.", promptIt: "Riassumi a cosa punta probabilmente questo link (da URL e titolo). Dichiara chiaramente che non hai aperto la pagina." },
  { id: "social-post", en: "Social post", it: "Post social", promptEn: "Write a short, engaging social post sharing this link, with hashtags.", promptIt: "Scrivi un post social breve e coinvolgente per condividere questo link, con hashtag." },
  { id: "discussion-points", en: "Discussion points", it: "Spunti di discussione", promptEn: "Suggest 3 interesting discussion points or questions about this link's topic.", promptIt: "Suggerisci 3 spunti o domande interessanti sul tema di questo link." },
];

const IMAGE: Def[] = [
  { id: "explain-image", en: "Explain image", it: "Spiega immagine", promptEn: "Describe this image in detail: subject, composition, colors, mood.", promptIt: "Descrivi questa immagine in dettaglio: soggetto, composizione, colori, atmosfera.", needsImage: true },
  { id: "alt-text", en: "Alt text", it: "Testo alternativo", promptEn: "Write a concise alt text for this image (max 150 characters). Reply with the alt text only.", promptIt: "Scrivi un alt text conciso per questa immagine (max 150 caratteri). Rispondi solo con l'alt text.", needsImage: true },
  { id: "image-caption", en: "Caption", it: "Didascalia", promptEn: "Write a short, catchy caption for this image for social media.", promptIt: "Scrivi una didascalia breve e accattivante per questa immagine, da social.", needsImage: true },
];

const COLOR: Def[] = [
  { id: "color-usage", en: "Name & usage", it: "Nome e usi", promptEn: "Give this color a evocative name and suggest 3 UI uses for it.", promptIt: "Dai a questo colore un nome evocativo e suggerisci 3 usi in UI." },
  { id: "color-palette", en: "Accessible palette", it: "Palette accessibile", promptEn: "Suggest a 4-color accessible palette around this color (hex codes) with contrast notes.", promptIt: "Suggerisci una palette accessibile di 4 colori attorno a questo (codici hex) con note sul contrasto." },
];

export function actionsForClip(clip: Clip, ctx: AiActionCtx, locale: Locale): AiAction[] {
  const byId = (list: Def[]) => list.map((d) => pick(locale, d));
  const textFallback = byId(TEXT);
  if (ctx.url) return byId(LINK);
  if (clip.kind === "image" || ctx.imageDataUrl) {
    return [...byId(IMAGE), byId(TEXT)[0]];
  }
  if (ctx.colorHex || clip.kind === "color") return [...byId(COLOR), byId(TEXT)[0]];
  if (clip.kind === "code") return byId(CODE);
  if (ctx.placeholders.length > 0) {
    const tpl: Def[] = [
      { id: "fill-template", en: "Fill template", it: "Compila template", promptEn: "Fill the placeholders in this template with realistic sample values. Reply with the filled text only.", promptIt: "Compila i segnaposto di questo template con valori di esempio realistici. Rispondi solo con il testo compilato." },
      { id: "template-variants", en: "3 variants", it: "3 varianti", promptEn: "Rewrite this template in 3 tone variants (formal, friendly, concise), keeping the placeholders.", promptIt: "Riscrivi questo template in 3 varianti di tono (formale, amichevole, concisa), mantenendo i segnaposto." },
    ];
    return [...byId(tpl), byId(TEXT)[0]];
  }
  if (ctx.email) return [...byId(EMAIL), byId(TEXT)[0]];
  if (ctx.phone) {
    return [pick(locale, { id: "draft-message", en: "Draft message", it: "Bozza messaggio", promptEn: "Draft a short message to send to this phone number. Reply with the draft only.", promptIt: "Scrivi una bozza di messaggio breve da inviare a questo numero. Rispondi solo con la bozza." }), byId(TEXT)[0]];
  }
  if (ctx.isAddress) {
    return [pick(locale, { id: "format-address", en: "Format address", it: "Formatta indirizzo", promptEn: "Format this address cleanly for a shipping label, one line per field.", promptIt: "Formatta questo indirizzo in modo pulito per un'etichetta di spedizione, un campo per riga." }), byId(TEXT)[0]];
  }
  if (ctx.isQr) {
    return [pick(locale, { id: "decode-qr", en: "Explain content", it: "Spiega contenuto", promptEn: "Explain what this QR code payload means and what happens when scanned.", promptIt: "Spiega cosa significa questo contenuto QR e cosa succede scansionandolo." }), byId(TEXT)[0]];
  }
  if (ctx.unitTitle) {
    return [pick(locale, { id: "explain-calc", en: "Explain conversion", it: "Spiega conversione", promptEn: "Explain this value and its unit conversions briefly.", promptIt: "Spiega brevemente questo valore e le sue conversioni di unità." }), byId(TEXT)[0]];
  }
  return textFallback;
}

export function systemPrompt(locale: Locale): string {
  return locale === "it"
    ? "Sei l'assistente dentro Boardify, un clipboard manager. Rispondi in italiano, in markdown compatto. Niente preamboli."
    : "You are the assistant inside Boardify, a clipboard manager. Reply in English, compact markdown. No preamble.";
}

/** Azione "Categorizza": propone 1-3 nomi riusando le categorie esistenti quando calzano. */
export function categorizeAction(existing: string[], locale: Locale): AiAction {
  const names = existing.filter((n) => n !== "History").slice(0, 30);
  const hint = names.length > 0 ? `Prefer these existing when fitting: ${names.join(", ")}. ` : "";
  return {
    id: "categorize",
    label: locale === "it" ? "Categorizza con AI" : "Categorize with AI",
    instruction: locale === "it"
      ? `${hint}Proponi 1-3 nomi di categoria brevi (max 3 parole) per questo contenuto. Rispondi SOLO con un array JSON di stringhe, es. ["Lavoro", "Ricette"].`
      : `${hint}Suggest 1-3 short category names (max 3 words) for this content. Reply ONLY with a JSON array of strings, e.g. ["Work", "Recipes"].`,
    needsImage: false,
  };
}

/** Nomi suggeriti dal risultato di "categorize": array JSON oppure lista puntata. */
export function parseCategorySuggestions(raw: string): string[] {
  const clean = (s: string) =>
    s.replace(/^[\s\-*•\d.)\]]+/, "").replace(/^["'«»“”]+|["'«»“”.,;]+$/g, "").trim();
  try {
    const j = JSON.parse(raw.trim()) as unknown;
    const arr = Array.isArray(j) ? j : j != null ? [j] : [];
    const out = arr.map((x) => clean(String(x))).filter((x) => x.length > 0 && x.length <= 28);
    if (out.length > 0) return [...new Set(out)].slice(0, 4);
  } catch {
    /* fallback lista */
  }
  return [...new Set(
    raw.split(/\n|,/).map(clean).filter((x) => x.length > 0 && x.length <= 28 && !/^(json|```)/i.test(x)),
  )].slice(0, 4);
}

/** Testo da inviare: testo del clip + eventuale contesto (titolo link, hex colore, OCR). */
export function clipInput(clip: Clip, ctx: AiActionCtx): string {
  const parts: string[] = [];
  if (ctx.url && ctx.url !== (clip.text ?? clip.preview).trim()) parts.push(`URL: ${ctx.url}`);
  if (ctx.colorHex) parts.push(`Color: ${ctx.colorHex}`);
  if (ctx.langLabel) parts.push(`Language: ${ctx.langLabel}`);
  const body = (clip.text ?? clip.preview ?? "").trim();
  if (body) parts.push(body);
  const ocr = (clip.ocr_text ?? "").trim();
  if (ocr && !body.includes(ocr.slice(0, 40))) parts.push(`OCR: ${ocr}`);
  return parts.join("\n\n").trim();
}
