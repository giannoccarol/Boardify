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
  { id: "summarize", en: "Summarize", it: "Riassumi", promptEn: "Summarize in 3-5 concise bullet points: only the list, one line per point.", promptIt: "Riassumi in 3-5 punti essenziali: solo l'elenco, una riga per punto." },
  { id: "key-points", en: "Key points", it: "Punti chiave", promptEn: "Extract the key points as a short list: only the list, no fluff.", promptIt: "Estrai i punti chiave in una lista breve: solo l'elenco, niente giri di parole." },
  { id: "translate", en: "Translate EN⇄IT", it: "Traduci EN⇄IT", promptEn: "Translate to Italian if the text is English, otherwise to English. Keep formatting and line breaks. Reply with the translation only.", promptIt: "Se il testo è in inglese traducilo in italiano, altrimenti in inglese. Mantieni formattazione e righe. Rispondi solo con la traduzione." },
  { id: "fix-grammar", en: "Fix grammar", it: "Correggi", promptEn: "Fix grammar, spelling and punctuation, keeping lines and formatting. If it is already correct, return it unchanged. Reply with the corrected text only.", promptIt: "Correggi grammatica, ortografia e punteggiatura, mantenendo righe e formato. Se è già corretto, restituiscilo invariato. Solo il testo corretto." },
  { id: "formal", en: "Make formal", it: "Rendi formale", promptEn: "Rewrite in a formal, professional tone, keeping lines and formatting. Reply with the rewritten text only.", promptIt: "Riscrivi in tono formale e professionale, mantenendo righe e formato. Solo il testo riscritto." },
  { id: "eli5", en: "Explain simply", it: "Spiega semplice", promptEn: "Explain in simple terms, as if to a beginner: short sentences or a few bullet points. Only the explanation.", promptIt: "Spiega in modo semplice, come a un principiante: frasi brevi o pochi punti. Solo la spiegazione." },
];

const EMAIL: Def[] = [
  { id: "reply-draft", en: "Draft reply", it: "Bozza risposta", promptEn: "Draft a short, polite reply in the same language as the email. Only the draft, no commentary.", promptIt: "Scrivi una bozza di risposta breve e cortese, nella stessa lingua dell'email. Solo la bozza, senza commenti." },
  { id: "email-actions", en: "Action items", it: "Azioni richieste", promptEn: "List what this email asks the recipient to do, as a markdown checklist (- [ ]). Only the list.", promptIt: "Elenca cosa chiede questa email al destinatario, come checklist markdown (- [ ]). Solo l'elenco." },
];

const CODE: Def[] = [
  { id: "explain-code", en: "Explain code", it: "Spiega codice", promptEn: "Explain what this code does, section by section: bold title plus 1-2 lines per section. Only the explanation.", promptIt: "Spiega cosa fa questo codice, sezione per sezione: titolo in grassetto più 1-2 righe per sezione. Solo la spiegazione." },
  { id: "find-bugs", en: "Find bugs", it: "Trova bug", promptEn: "Review for bugs, edge cases and security issues. One bullet per problem (what, why, one-line fix). If it is clean, say so in one line.", promptIt: "Revisiona: bug, casi limite e sicurezza. Un punto per problema (cosa, perché, fix in una riga). Se è pulito, dillo in una riga." },
  { id: "optimize", en: "Optimize", it: "Ottimizza", promptEn: "Propose a faster or cleaner version in a fenced block with language, then 2-3 lines on why. Only that.", promptIt: "Proponi una versione più veloce o pulita in fence con linguaggio, poi 2-3 righe sul perché. Solo questo." },
  { id: "add-comments", en: "Add comments", it: "Aggiungi commenti", promptEn: "Return the same code with clear, concise comments added, in a fenced block with language. Only the code.", promptIt: "Restituisci lo stesso codice con commenti chiari e concisi, in fence con linguaggio. Solo il codice." },
  { id: "gen-tests", en: "Generate tests", it: "Genera test", promptEn: "Generate the essential unit tests in the same language, in a fenced block with language. Only the code.", promptIt: "Genera gli unit test essenziali nello stesso linguaggio, in fence con linguaggio. Solo il codice." },
];

const LINK: Def[] = [
  { id: "summarize-link", en: "Summarize link", it: "Riassumi link", promptEn: "Summarize in 3-5 bullets what this link likely points to (from URL and title). State that you did not fetch the page. Only the bullets.", promptIt: "Riassumi in 3-5 punti a cosa punta probabilmente questo link (da URL e titolo). Dichiara che non hai aperto la pagina. Solo i punti." },
  { id: "social-post", en: "Social post", it: "Post social", promptEn: "Write a short (max 280 characters), engaging social post sharing this link, with hashtags. Only the post.", promptIt: "Scrivi un post social breve (max 280 caratteri) e coinvolgente per condividere questo link, con hashtag. Solo il post." },
  { id: "discussion-points", en: "Discussion points", it: "Spunti di discussione", promptEn: "Suggest 3 interesting discussion points or questions about this link's topic, one per line. Only the list.", promptIt: "Suggerisci 3 spunti o domande interessanti sul tema del link, uno per riga. Solo l'elenco." },
];

const IMAGE: Def[] = [
  { id: "explain-image", en: "Explain image", it: "Spiega immagine", promptEn: "Describe in detail — subject, composition, colors, mood — one bullet per aspect. Only the description.", promptIt: "Descrivi in dettaglio — soggetto, composizione, colori, atmosfera — un punto per voce. Solo la descrizione.", needsImage: true },
  { id: "alt-text", en: "Alt text", it: "Testo alternativo", promptEn: "Write a concise alt text for this image (max 150 characters). Reply with the alt text only, no quotes.", promptIt: "Scrivi un alt text conciso per questa immagine (max 150 caratteri). Rispondi solo con l'alt text, senza virgolette.", needsImage: true },
  { id: "image-caption", en: "Caption", it: "Didascalia", promptEn: "Write a short, catchy social-media caption for this image. Only the caption.", promptIt: "Scrivi una didascalia breve e accattivante da social per questa immagine. Solo la didascalia.", needsImage: true },
];

const COLOR: Def[] = [
  { id: "color-usage", en: "Name & usage", it: "Nome e usi", promptEn: "Give this color an evocative name plus 3 UI uses, one bullet per use. Only that.", promptIt: "Dai a questo colore un nome evocativo più 3 usi in UI, un punto per uso. Solo questo." },
  { id: "color-palette", en: "Accessible palette", it: "Palette accessibile", promptEn: "Propose a 4-color accessible palette around this color as a markdown table (Color | Hex | Use | Contrast). Only the table.", promptIt: "Proponi una palette accessibile di 4 colori attorno a questo, come tabella markdown (Colore | Hex | Uso | Contrasto). Solo la tabella." },
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
      { id: "fill-template", en: "Fill template", it: "Compila template", promptEn: "Fill the placeholders with realistic sample values, keeping everything else identical. Reply with the filled text only.", promptIt: "Compila i segnaposto con valori di esempio realistici, resto identico. Solo il testo compilato." },
      { id: "template-variants", en: "3 variants", it: "3 varianti", promptEn: "Rewrite in 3 variants (formal, friendly, concise) keeping the placeholders, one section each with a bold label. Only the variants.", promptIt: "Riscrivi in 3 varianti (formale, amichevole, concisa) con i segnaposto invariati, una sezione per variante con etichetta in grassetto. Solo le varianti." },
    ];
    return [...byId(tpl), byId(TEXT)[0]];
  }
  if (ctx.email) return [...byId(EMAIL), byId(TEXT)[0]];
  if (ctx.phone) {
    return [pick(locale, { id: "draft-message", en: "Draft message", it: "Bozza messaggio", promptEn: "Draft a short, direct message to send to this number. Only the message, no commentary.", promptIt: "Scrivi un messaggio breve e diretto da inviare a questo numero. Solo il messaggio, senza commenti." }), byId(TEXT)[0]];
  }
  if (ctx.isAddress) {
    return [pick(locale, { id: "format-address", en: "Format address", it: "Formatta indirizzo", promptEn: "Format for a shipping label, one field per line. Only the address, no commentary.", promptIt: "Formatta per un'etichetta di spedizione, un campo per riga. Solo l'indirizzo, senza commenti." }), byId(TEXT)[0]];
  }
  if (ctx.isQr) {
    return [pick(locale, { id: "decode-qr", en: "Explain content", it: "Spiega contenuto", promptEn: "Explain in 2-4 lines what this content is and what happens when scanned. Only the explanation.", promptIt: "Spiega in 2-4 righe cosa contiene e cosa succede scansionandolo. Solo la spiegazione." }), byId(TEXT)[0]];
  }
  if (ctx.unitTitle) {
    return [pick(locale, { id: "explain-calc", en: "Explain conversion", it: "Spiega conversione", promptEn: "Explain the value and its conversions in 2-4 lines, numbers in bold. Only the explanation.", promptIt: "Spiega valore e conversioni in 2-4 righe, numeri in grassetto. Solo la spiegazione." }), byId(TEXT)[0]];
  }
  return textFallback;
}

export function systemPrompt(locale: Locale): string {
  return locale === "it"
    ? "Sei l'assistente dentro Boardify, un clipboard manager. Rispondi in italiano, in markdown compatto (grassetto, elenchi, tabelle quando utili). Inizia direttamente dal contenuto: niente preamboli, niente conclusioni. Il codice va in fence con linguaggio. Per le riscritture restituisci solo il risultato."
    : "You are the assistant inside Boardify, a clipboard manager. Reply in English, compact markdown (bold, lists, tables when useful). Start directly with the content: no preamble, no closing remarks. Code goes in fenced blocks with language. For rewrites, reply with the result only.";
}

/** Azione "Categorizza": propone 1-3 nomi riusando le categorie esistenti quando calzano. */
export function categorizeAction(existing: string[], locale: Locale): AiAction {
  const names = existing.filter((n) => n !== "History").slice(0, 30);
  const hint = names.length > 0 ? `Prefer these existing when fitting: ${names.join(", ")}. ` : "";
  return {
    id: "categorize",
    label: locale === "it" ? "Categorizza con AI" : "Categorize with AI",
    instruction: locale === "it"
      ? `${hint}Proponi 1-3 nomi di categoria brevi (max 3 parole). Ignora il formato markdown: rispondi SOLO con un array JSON di stringhe, senza fence né altro testo, es. ["Lavoro", "Ricette"].`
      : `${hint}Suggest 1-3 short category names (max 3 words). Ignore the markdown format: reply ONLY with a JSON array of strings, no fences or other text, e.g. ["Work", "Recipes"].`,
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
