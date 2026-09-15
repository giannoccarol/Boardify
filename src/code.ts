/** Pico-rilevatore linguaggio per snippet. Niente highlight lib: solo badge. */

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
