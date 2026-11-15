import type { AiDisclosure, AiDisclosureItem, AiFeature, ChatMessage } from "./types";

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const PHONE = /(?<![\w])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,5}\)|\d{2,5})[\s.-]?(?:\d{3,5}[\s.-]?)?\d{4,5}(?![\w])/g;
const LONG_DIGITS = /(?<!\d)\d{7,}(?!\d)/g;
const HANDLE = /(?<![\w@])@[A-Za-z0-9_]{1,50}\b/g;
const SECRET_QUERY_KEY = /(?:token|key|secret|password|passwd|auth|credential|session|jwt|signature|sig|api[_-]?key|access[_-]?token|refresh[_-]?token)/i;
const REDACTED = "[REDACTED]";

function splitUrlPunctuation(value: string): { url: string; suffix: string } {
  const match = value.match(/[),.!?;:]+$/);
  if (!match) return { url: value, suffix: "" };
  return { url: value.slice(0, -match[0].length), suffix: match[0] };
}

function urlContainsSecret(value: string): boolean {
  try {
    const parsed = new URL(value.startsWith("www.") ? `https://${value}` : value);
    for (const [key, entry] of parsed.searchParams) {
      if (SECRET_QUERY_KEY.test(key)) return true;
      if (entry.length >= 32 && /[A-Za-z]/.test(entry) && /\d/.test(entry)) return true;
    }
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments.some((segment, index) => {
      if (SECRET_QUERY_KEY.test(segment)) return Boolean(segments[index + 1]);
      return segment.length >= 32 && /[A-Za-z]/.test(segment) && /\d/.test(segment);
    });
  } catch {
    return false;
  }
}

function redactPhones(text: string): string {
  return text.replace(PHONE, (candidate) => {
    const digits = candidate.replace(/\D/g, "");
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(candidate)) return candidate;
    return digits.length >= 7 && digits.length <= 15 ? REDACTED : candidate;
  });
}

/** Removes common direct identifiers and truncates the result to `maxChars`. */
export function redactForAi(text: string, maxChars: number): string {
  const limit = Number.isFinite(maxChars) ? Math.max(0, Math.floor(maxChars)) : 0;
  let redacted = text
    .replace(EMAIL, REDACTED)
    .replace(URL_PATTERN, (candidate) => {
      const { url, suffix } = splitUrlPunctuation(candidate);
      return urlContainsSecret(url) ? `${REDACTED}${suffix}` : candidate;
    });
  redacted = redactPhones(redacted)
    .replace(LONG_DIGITS, REDACTED)
    .replace(HANDLE, REDACTED);
  return redacted.slice(0, limit);
}

/**
 * Builds a disclosure from the exact redacted excerpts that should be sent.
 * `items.length` is the source count; callers include each source date in its
 * label and apply their consent scope's excerpt limit before calling this.
 */
export function buildDisclosure(
  feature: AiFeature,
  purpose: string,
  model: string,
  items: readonly AiDisclosureItem[],
): AiDisclosure {
  const safeItems = items.map((item) => ({
    id: item.id,
    label: redactForAi(item.label, item.label.length),
    text: redactForAi(item.text, item.text.length),
  }));
  return {
    feature,
    purpose: redactForAi(purpose, purpose.length),
    model,
    items: safeItems,
    totalChars: safeItems.reduce((sum, item) => sum + item.text.length, 0),
  };
}

/**
 * Use this to make a ChatJsonRequest's message from the same disclosure object
 * shown in the UI. The provider receives this JSON verbatim as the user message.
 */
export function messagesFromDisclosure(disclosure: AiDisclosure): ChatMessage[] {
  return [{ role: "user", content: JSON.stringify(disclosure) }];
}
