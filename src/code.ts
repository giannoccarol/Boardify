/** Pico-rilevatore linguaggio per snippet + highlight stile VS Code (Dark+).
 * Niente librerie esterne: tokenizer hand-rolled, solo frontend. */

export interface LangGuess {
  lang: string;
  label: string;
}

const RULES: { lang: string; label: string; pats: RegExp[] }[] = [
  { lang: "ts", label: "TS", pats: [/\b(const|let|interface|type\s+\w+\s*=)\b/, /=>/, /\bimport\s+.+\s+from\s+['"]/, /console\./] },
  { lang: "py", label: "Python", pats: [/^\s*def\s+\w+\s*\(/m, /^\s*(import|from)\s+\w+/m, /print\s*\(/, /if\s+__name__\s*==/] },
  { lang: "rust", label: "Rust", pats: [/\bfn\s+\w+\s*\(/, /let\s+mut\s+/, /println!\s*\(/, /impl(\s+.*\s+for)?\s+\w+/, /::\w+/] },
  { lang: "sql", label: "SQL", pats: [/^\s*SELECT\b/mi, /^\s*(INSERT|UPDATE|DELETE)\b/mi, /^\s*CREATE\s+TABLE\b/mi, /\bWHERE\b.*=.*;/] },
  { lang: "bash", label: "Bash", pats: [/^#!\s*\/bin\/(bash|sh)/m, /^\s*(sudo|pacman|yay|systemctl|journalctl|echo|export)\b/m, /\|\s*(grep|awk|sed|xargs|fzf)\b/] },
  { lang: "css", label: "CSS", pats: [/@media\b/, /display\s*:\s*(flex|grid)/, /#[0-9a-fA-F]{3,6}\s*;?\s*$/, /:\s*(hover|root|before)\b/] },
  { lang: "html", label: "HTML", pats: [/<(div|span|button|input|img|a|p|h[1-6])[\s>]/, /<\/\w+>/] },
];

export function guessLang(raw: string | null | undefined): LangGuess | null {
  if (!raw || raw.length > 8000) return null;
  let best: LangGuess | null = null;
  let bestScore = 0;
  for (const r of RULES) {
    let score = 0;
    for (const p of r.pats) {
      p.lastIndex = 0;
      if (p.test(raw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = { lang: r.lang, label: r.label };
    }
  }
  return bestScore > 0 ? best : null;
}

/** Formattazione sicura per tutti i linguaggi (mai re-indent semantico):
 * normalizza EOL, espande i tab, taglia i trailing space, rimuove le righe
 * vuote in testa/coda e toglie l'indent comune (tipico del copia da editor). */
export function formatCode(raw: string | null | undefined): string {
  if (!raw) return "";
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "  ")
    .split("\n")
    .map((l) => l.replace(/[ \u00a0]+$/, ""));
  while (lines.length > 0 && !lines[0].trim()) lines.shift();
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();
  let min = Infinity;
  for (const l of lines) {
    if (!l.trim()) continue;
    const m = /^ */.exec(l);
    if (m) min = Math.min(min, m[0].length);
  }
  const dedented =
    Number.isFinite(min) && min > 0
      ? lines.map((l) => (l.trim() ? l.slice(min) : ""))
      : lines;
  return dedented.join("\n");
}

// ── Highlight stile VS Code Dark+ ──────────────────────────────────

export type TokenKind =
  | "plain"
  | "kw" // keyword #569CD6
  | "str" // stringa #CE9178
  | "com" // commento #6A9955
  | "num" // numero #B5CEA8
  | "fn" // funzione #DCDCAA
  | "type" // tipo/classe #4EC9B0
  | "var" // variabile/proprietà #9CDCFE
  | "tag" // tag HTML #569CD6
  | "sel" // selettore CSS #D7BA7D
  | "pun"; // punteggiatura #808080

export interface CodeToken {
  text: string;
  kind: TokenKind;
}

const KEYWORDS: Record<string, string[]> = {
  ts: "const let var function return if else for while do switch case default break continue class interface type enum extends implements import from export async await new try catch finally throw typeof instanceof in of as satisfies readonly private public protected static get set constructor super this null undefined true false void never unknown any string number boolean".split(" "),
  py: "def return if elif else for while in not and or is None True False class import from as with try except finally raise lambda pass yield global nonlocal del assert async await print self".split(" "),
  rust: "fn let mut const static struct enum impl trait pub mod use crate super self Self return if else match for while loop in where as ref move async await unsafe extern dyn true false Some None Ok Err".split(" "),
  sql: "SELECT FROM WHERE GROUP BY ORDER HAVING LIMIT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP JOIN LEFT RIGHT INNER OUTER ON AS AND OR NOT NULL DISTINCT COUNT SUM AVG MIN MAX UNION ALL LIKE IN IS BETWEEN CASE WHEN THEN ELSE END".split(" "),
  bash: "if then else elif fi for while do done case esac in function echo cd ls export source sudo apt pacman yay systemctl journalctl grep awk sed xargs fzf chmod chown mkdir rm cp mv cat less exit return local shift trap".split(" "),
  css: ["media", "import", "supports", "keyframes", "font-face", "charset", "namespace", "important", "inherit", "initial", "unset"],
  html: ["html", "head", "body", "div", "span", "p", "a", "img", "button", "input", "form", "ul", "ol", "li", "table", "tr", "td", "th", "script", "style", "link", "meta", "title", "h1", "h2", "h3", "h4", "h5", "h6", "header", "footer", "nav", "main", "section", "article", "aside", "pre", "code", "em", "strong"],
};

interface LangCfg {
  line: string[];
  block: [string, string][];
  ciKeywords?: boolean;
}

const LANG_CFG: Record<string, LangCfg> = {
  ts: { line: ["//"], block: [["/*", "*/"]] },
  py: { line: ["#"], block: [['"""', '"""'], ["'''", "'''"]] },
  rust: { line: ["//"], block: [["/*", "*/"]] },
  sql: { line: ["--", "#"], block: [["/*", "*/"]], ciKeywords: true },
  bash: { line: ["#"], block: [] },
  css: { line: [], block: [["/*", "*/"]] },
  html: { line: [], block: [["<!--", "-->"]] },
};

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function tokenizeCode(raw: string, langId: string | null): CodeToken[] {
  const lang = (langId ?? "").toLowerCase();
  const cfg: LangCfg = LANG_CFG[lang] ?? { line: ["//", "#", "--"], block: [["/*", "*/"], ["<!--", "-->"]] };
  const kws = KEYWORDS[lang] ?? [];
  const parts: string[] = [];

  // Rust: attributi #[derive(..)] prima dei commenti (altrimenti # li mangia).
  if (lang === "rust") parts.push("(?<attr>#!?\\[[^\\n\\]]*\\]?)");
  // Docstring/stringhe multilinea prima dei commenti di linea.
  for (const [o, c] of cfg.block) {
    if (o.length > 2 || (o.startsWith('"') && c.startsWith('"'))) {
      parts.push(`(?<mstr>${escRe(o)}[\\s\\S]*?${escRe(c)})`);
    }
  }
  // Stringhe '...' "..." `...` (con escape).
  parts.push(`(?<str>"(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'|\`(?:\\\\.|[^\`\\\\])*\`)`);
  // Commenti di linea.
  for (const l of cfg.line) parts.push(`(?<coml>${escRe(l)}[^\\n]*)`);
  // Commenti a blocco restanti.
  for (const [o, c] of cfg.block) {
    if (o.length <= 2 && !o.startsWith('"')) {
      parts.push(`(?<comb>${escRe(o)}[\\s\\S]*?${escRe(c)})`);
    }
  }
  // Numeri (+ hex CSS).
  parts.push(`(?<num>\\b0x[0-9a-fA-F_]+\\b|#[0-9a-fA-F]{3,8}\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)`);
  // At-rule CSS (@media...) e !important.
  if (lang === "css") parts.push(`(?<atr>@[\\w-]+|![a-zA-Z]+)`);
  // Keyword del linguaggio.
  if (kws.length > 0) {
    parts.push(`(?<kw>\\b(?:${kws.map(escRe).join("|")})\\b)`);
  }
  // Chiamate fn( e macro rust println!(.
  parts.push(`(?<fn>\\b[a-zA-Z_]\\w*(?=\\s*!?\\())`);
  // Tipi PascalCase.
  parts.push(`(?<typ>\\b[A-Z][A-Za-z0-9_]*\\b)`);
  // Proprietà CSS / attr HTML prima di : o =.
  if (lang === "css") parts.push(`(?<prop>[a-zA-Z-]+(?=\\s*:))`);
  if (lang === "html") parts.push(`(?<attr>[a-zA-Z-:]+(?=\\s*=))`);
  if (lang === "html") parts.push(`(?<tag><\\/?[a-zA-Z][\\w-]*|\\/?>)`);
  // Selettori CSS (seguiti da { o ,).
  if (lang === "css") parts.push(`(?<sel>[.#]?[a-zA-Z][\\w-]*(?=\\s*[{,]))`);

  const flags = cfg.ciKeywords ? "gi" : "g";
  const re = new RegExp(parts.join("|"), flags);
  const out: CodeToken[] = [];
  let last = 0;
  const pushPlain = (text: string) => {
    if (!text) return;
    // Punteggiatura dim, resto plain.
    const pun = /([{}()[\];:,.=<>+\-*/|&!?~^%]+)/g;
    let li = 0;
    let m: RegExpExecArray | null;
    pun.lastIndex = 0;
    while ((m = pun.exec(text))) {
      if (m.index > li) out.push({ text: text.slice(li, m.index), kind: "plain" });
      out.push({ text: m[0], kind: "pun" });
      li = m.index + m[0].length;
    }
    if (li < text.length) out.push({ text: text.slice(li), kind: "plain" });
  };

  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(raw))) {
    if (m.index > last) pushPlain(raw.slice(last, m.index));
    const g = m.groups ?? {};
    const text = m[0];
    let kind: TokenKind = "plain";
    if (g.mstr != null || g.str != null) kind = "str";
    else if (g.coml != null || g.comb != null) kind = "com";
    else if (g.num != null) kind = "num";
    else if (g.atr != null || g.kw != null) kind = lang === "html" ? "tag" : "kw";
    else if (g.fn != null) kind = "fn";
    else if (g.typ != null) kind = "type";
    else if (g.prop != null || g.attr != null) kind = "var";
    else if (g.tag != null) kind = "tag";
    else if (g.sel != null) kind = "sel";
    out.push({ text, kind });
    last = m.index + text.length;
    if (text.length === 0) re.lastIndex++;
  }
  if (last < raw.length) pushPlain(raw.slice(last));
  return out;
}

/** Spezza i token in righe per il gutter con numeri (mantiene il kind). */
export function tokensByLine(tokens: CodeToken[]): CodeToken[][] {
  const lines: CodeToken[][] = [[]];
  for (const t of tokens) {
    const parts = t.text.split("\n");
    parts.forEach((p, i) => {
      if (i > 0) lines.push([]);
      if (p) lines[lines.length - 1].push({ text: p, kind: t.kind });
    });
  }
  return lines;
}
