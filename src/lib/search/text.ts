/**
 * Plain-text utilities shared by the seed-mode search and the deterministic (demo) AI fallbacks:
 * tokenising, light stemming, BM25 scoring and `<mark>` snippets (HTML-escaped otherwise).
 */

export const STOPWORDS = new Set(
  (
    "a about above after again against all am an and any are aren't as at be because been before being below between both " +
    "but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further " +
    "had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i " +
    "i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on once " +
    "only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such " +
    "than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this " +
    "those through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where " +
    "where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself " +
    "yourselves yeah yes okay ok um uh like just really so right well also get got going gonna thing things kind sort maybe " +
    "think know mean actually pretty lot bit oh hey thanks thank"
  ).split(/\s+/),
);

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;

/** Lowercased word tokens (apostrophes kept inside words). */
export function words(text: string): string[] {
  return (text.toLowerCase().replace(/’/g, "'").match(WORD_RE) ?? []) as string[];
}

/** Very light suffix stripping, good enough to match "pricing" ~ "price" ~ "prices". */
export function stem(w: string): string {
  let s = w.replace(/'s$/, "");
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith("ies")) s = s.slice(0, -3) + "y";
  else if (s.length > 3 && s.endsWith("es") && !s.endsWith("ses")) s = s.slice(0, -1);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

/** Content terms: lowercased, stopwords removed, stemmed. */
export function terms(text: string): string[] {
  return words(text)
    .filter((w) => !STOPWORDS.has(w) && (w.length > 1 || /\d/.test(w)))
    .map(stem);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// BM25
// ---------------------------------------------------------------------------

export interface Bm25Doc {
  terms: string[];
}

export class Bm25<T extends Bm25Doc> {
  private df = new Map<string, number>();
  private avgLen: number;
  private tfs: Map<string, number>[];

  constructor(
    public docs: T[],
    private k1 = 1.4,
    private b = 0.6,
  ) {
    this.tfs = docs.map((d) => {
      const tf = new Map<string, number>();
      for (const t of d.terms) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return tf;
    });
    this.avgLen = docs.reduce((n, d) => n + d.terms.length, 0) / Math.max(1, docs.length);
  }

  idf(term: string): number {
    const n = this.df.get(term) ?? 0;
    return Math.log(1 + (this.docs.length - n + 0.5) / (n + 0.5));
  }

  score(i: number, query: string[]): number {
    const tf = this.tfs[i];
    const len = this.docs[i].terms.length;
    let s = 0;
    for (const q of new Set(query)) {
      const f = tf.get(q) ?? 0;
      if (!f) continue;
      s += this.idf(q) * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * len) / (this.avgLen || 1))));
    }
    return s;
  }

  /** Top-k docs by score (score > 0 only). */
  top(query: string[], k: number): { doc: T; index: number; score: number }[] {
    if (!query.length) return [];
    const out: { doc: T; index: number; score: number }[] = [];
    this.docs.forEach((doc, index) => {
      const score = this.score(index, query);
      if (score > 0) out.push({ doc, index, score });
    });
    return out.sort((a, b) => b.score - a.score).slice(0, k);
  }
}

// ---------------------------------------------------------------------------
// Keyword search matching + snippets (seed-mode equivalent of websearch_to_tsquery + ts_headline)
// ---------------------------------------------------------------------------

export interface ParsedQuery {
  /** Terms that must all match (prefix match on word tokens). */
  terms: string[];
  /** Quoted phrases that must appear verbatim (case-insensitive). */
  phrases: string[];
}

export function parseQuery(q: string): ParsedQuery {
  const phrases: string[] = [];
  const rest = q.replace(/"([^"]+)"/g, (_m, p: string) => {
    const norm = words(p).join(" ");
    if (norm) phrases.push(norm);
    return " ";
  });
  const all = words(rest);
  let ts = all.filter((w) => !STOPWORDS.has(w));
  if (!ts.length) ts = all; // query of only stopwords: still search them
  for (const p of phrases) ts.push(...words(p).filter((w) => !STOPWORDS.has(w)));
  return { terms: Array.from(new Set(ts)), phrases };
}

function termMatches(token: string, term: string): "exact" | "prefix" | null {
  if (token === term) return "exact";
  if (token.startsWith(term) && term.length >= 2) return "prefix";
  // light stem equivalence ("prices" ~ "price", "pricing" ~ "price")
  if (term.length >= 4 && stem(token) === stem(term)) return "prefix";
  return null;
}

/** Returns a rank > 0 when every term (and phrase) matches the text, else 0. */
export function matchRank(text: string, pq: ParsedQuery, idf?: (t: string) => number): number {
  const toks = words(text);
  if (!toks.length) return 0;
  const lower = toks.join(" ");
  for (const p of pq.phrases) if (!lower.includes(p)) return 0;
  let rank = 0;
  for (const term of pq.terms) {
    let best = 0;
    let count = 0;
    for (const tok of toks) {
      const m = termMatches(tok, term);
      if (m) {
        count++;
        best = Math.max(best, m === "exact" ? 1 : 0.6);
      }
    }
    if (!count) return 0;
    rank += best * (1 + Math.log(count)) * (idf ? idf(term) : 1);
  }
  if (pq.phrases.length) rank *= 1.5;
  // Adjacent-terms bonus (the whole query appears as typed)
  if (pq.terms.length > 1 && lower.includes(pq.terms.join(" "))) rank *= 1.3;
  // Mild length normalisation: prefer focused segments.
  return rank / (1 + Math.log(1 + toks.length / 25));
}

/**
 * ts_headline-style snippet: a window of ~maxWords around the first match, HTML-escaped,
 * with matching words wrapped in <mark>…</mark>.
 */
export function highlightSnippet(text: string, pq: ParsedQuery, maxWords = 32): string {
  const parts = text.split(/(\s+)/); // keep whitespace
  const wordIdx: number[] = [];
  parts.forEach((p, i) => {
    if (p.trim()) wordIdx.push(i);
  });
  const isMatch = (part: string) => {
    const toks = words(part);
    return toks.some((t) => pq.terms.some((term) => termMatches(t, term)));
  };
  let firstMatchWord = wordIdx.findIndex((i) => isMatch(parts[i]));
  if (firstMatchWord < 0) firstMatchWord = 0;
  let startW = 0;
  let endW = wordIdx.length;
  if (wordIdx.length > maxWords) {
    startW = Math.max(0, firstMatchWord - Math.floor(maxWords / 3));
    endW = Math.min(wordIdx.length, startW + maxWords);
    startW = Math.max(0, endW - maxWords);
  }
  const out: string[] = [];
  for (let w = startW; w < endW; w++) {
    const i = wordIdx[w];
    const part = parts[i];
    if (w > startW) out.push(" ");
    out.push(isMatch(part) ? markWord(part, pq) : escapeHtml(part));
  }
  return (startW > 0 ? "… " : "") + out.join("") + (endW < wordIdx.length ? " …" : "");
}

/** Wrap only the word characters of a whitespace-free chunk in <mark>, leaving punctuation outside. */
function markWord(chunk: string, pq: ParsedQuery): string {
  return chunk
    .split(/([\p{L}\p{N}'’]+)/u)
    .map((piece) => {
      if (!piece) return "";
      const toks = words(piece);
      const hit = toks.length && toks.some((t) => pq.terms.some((term) => termMatches(t, term)));
      return hit ? `<mark>${escapeHtml(piece)}</mark>` : escapeHtml(piece);
    })
    .join("");
}

/** Split text into sentences (keeps terminal punctuation). */
export function sentences(text: string): string[] {
  const out = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [text];
  return out.map((s) => s.trim()).filter(Boolean);
}
