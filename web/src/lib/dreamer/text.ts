import type { InsightKind } from "./types";

const STOPWORDS = new Set(
  `a an and are as at be been being but by can could did do does doing for from had has have having he her here hers him his how i if in into is it its just may again still today yesterday tomorrow really very much many lot lots always never often sometimes also even already today's thing things something anything way ways me might more most my no nor not of on once only or our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who why will with would you your yours`.split(
    " ",
  ),
);

/** Small, intentionally conservative stemmer for local theme matching. */
export function stem(word: string): string {
  let value = word.toLowerCase();
  if (value.length > 5 && value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.length > 6 && value.endsWith("ing")) value = value.slice(0, -3);
  else if (value.length > 5 && value.endsWith("ed")) value = value.slice(0, -2);
  else if (value.length > 5 && value.endsWith("ers")) value = value.slice(0, -1);
  else if (value.length > 4 && value.endsWith("es")) value = value.slice(0, -2);
  else if (value.length > 3 && value.endsWith("s")) value = value.slice(0, -1);
  if (value.length > 5 && value.endsWith("e")) value = value.slice(0, -1);
  return value;
}

export type Token = { term: string; start: number; end: number };

export function tokenize(text: string): Token[] {
  const result: Token[] = [];
  const pattern = /[a-zA-Z][a-zA-Z'-]{1,}/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0].toLowerCase().replace(/^'+|'+$/g, "");
    const term = stem(raw);
    if (!term || STOPWORDS.has(raw) || STOPWORDS.has(term) || term.length < 3) continue;
    const start = match.index ?? 0;
    result.push({ term, start, end: start + match[0].length });
  }
  return result;
}

export type Sentence = { text: string; start: number; end: number };

/** Sentence slices retain exact source offsets for inspectable evidence. */
export function sentences(text: string): Sentence[] {
  const result: Sentence[] = [];
  const pattern = /[^.!?\n]+(?:[.!?]+|(?=\n)|$)/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const leading = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const start = (match.index ?? 0) + leading;
    result.push({ text: trimmed, start, end: start + trimmed.length });
  }
  return result;
}

export type Candidate = { kind: InsightKind; text: string; sentence: Sentence; polarity: -1 | 0 | 1 };

const RULES: readonly [InsightKind, RegExp][] = [
  ["commitment", /\b(i promised|i committed|i owe|must finish|deadline|by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i],
  ["project_idea", /\bidea\s*:\s*|\b(i have an idea for|what if i built|could build a)\b/i],
  ["intention", /\b(i want to|i'd like to|i need to|i should|need to|should|plan to|going to|i will|i'll)\b/i],
  ["problem", /\b(stuck|annoying|frustrat(?:ed|ing)|can't|cannot|problem|struggl\w*|keep (?:forgetting|getting|missing|running)|not working|too slow)\b/i],
  ["learning_goal", /\b(learn|study|understand|practice|practise)\b.{0,50}\b(need|want|should|more|better|how)\b/i],
  ["interest", /\b(i enjoy|i like|interested in|curious about|love working on)\b/i],
  ["improvement", /\b(workflow|process|routine|system)\b.{0,50}\b(improv|slow|annoy|repeat|friction|fix)\w*/i],
];

/** Explicit rule-based candidates; these remain hypotheses until reviewed. */
export function detectCandidates(text: string): Candidate[] {
  const found: Candidate[] = [];
  for (const sentence of sentences(text)) {
    const lower = sentence.text.toLowerCase();
    const polarity: -1 | 0 | 1 = /\b(no longer|don't|do not|never|stopped|not)\b/.test(lower) ? -1 : 1;
    const seen = new Set<InsightKind>();
    for (const [kind, rule] of RULES) {
      if (rule.test(sentence.text) && !seen.has(kind)) {
        found.push({ kind, text: `${kind.replaceAll("_", " ")}: ${sentence.text}`, sentence, polarity });
        seen.add(kind);
      }
    }
    if (sentence.text.endsWith("?") || /^(what if|how do i|could i|can i|why does)\b/i.test(sentence.text)) {
      found.push({ kind: "unresolved_question", text: `Unresolved question: ${sentence.text}`, sentence, polarity: 0 });
    }
    if (/\bi keep\b/i.test(sentence.text) && !seen.has("problem")) {
      found.push({ kind: "observation", text: `Repeated observation: ${sentence.text}`, sentence, polarity });
    }
  }
  return found;
}

export function normalizeSignature(value: string): string {
  return tokenize(value).map((token) => token.term).sort().join(" ").slice(0, 240);
}

export function termSimilarity(left: string, right: string): number {
  const a = new Set(tokenize(left).map((token) => token.term));
  const b = new Set(tokenize(right).map((token) => token.term));
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const term of a) if (b.has(term)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

/**
 * Confidence formula for a local hypothesis:
 * 0.10 per independent evidence item (max .40), 0.12 per extra date (max .36),
 * plus .20 times exponential 30-day recency. Opposing evidence costs .18.
 * It is a ranking aid, not a probability that a personal statement is true.
 */
export function confidenceScore(evidence: readonly { date: string; polarity?: number }[], now: Date): number {
  if (evidence.length === 0) return 0;
  const dates = new Set(evidence.map((item) => item.date));
  const latest = evidence.map((item) => Date.parse(`${item.date}T00:00:00Z`)).filter(Number.isFinite).sort((a, b) => b - a)[0];
  const ageDays = latest === undefined ? 365 : Math.max(0, (now.getTime() - latest) / 86_400_000);
  const polarities = new Set(evidence.map((item) => item.polarity).filter((value) => value === -1 || value === 1));
  const contradictionPenalty = polarities.size > 1 ? 0.18 : 0;
  return Math.max(0, Math.min(1,
    Math.min(evidence.length, 4) * 0.1 +
    Math.min(Math.max(0, dates.size - 1), 3) * 0.12 +
    0.2 * Math.exp(-ageDays / 30) - contradictionPenalty,
  ));
}
