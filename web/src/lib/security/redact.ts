/**
 * Scrubs secrets from text and structured values before they reach logs.
 * Covers bearer tokens, integration tokens (trk_...), the session cookie and
 * cookie headers, and password/secret/token-like key=value pairs.
 */

export const REDACTED = "[REDACTED]";

const SENSITIVE_KEY =
  /pass(word|wd)?|secret|token|api[-_]?key|authorization|cookie|credential/i;

const PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // "Authorization: Bearer abc" and bare "Bearer abc".
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`],
  // Scoped integration tokens: trk_ followed by base64url.
  [/\btrk_[A-Za-z0-9_-]+/g, `trk_${REDACTED}`],
  // Whole Cookie / Set-Cookie header lines.
  [/\b(set-cookie|cookie)(\s*[:=]\s*)[^\r\n]+/gi, `$1$2${REDACTED}`],
  // The app's own session cookie, wherever it appears.
  [/\btrack_session=[^;\s,"']+/g, `track_session=${REDACTED}`],
  // password=..., "secret": "...", api_key: ... (quoted or bare).
  [
    /((?:password|passwd|secret|token|api[-_]?key)["']?\s*[:=]\s*["']?)[^\s"',;&}]+/gi,
    `$1${REDACTED}`,
  ],
];

/** Redacts secrets inside a free-form string (log lines, error messages). */
export function redactText(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PATTERNS)
    out = out.replace(pattern, replacement);
  return out;
}

/**
 * Redacts a structured value. Sensitive keys are replaced wholesale, strings
 * are scrubbed with redactText, and Errors keep only their name and message
 * (stacks can echo request data). Depth is capped against cyclic input.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[Truncated]";
  if (typeof value === "string") return redactText(value);
  if (value instanceof Error)
    return { name: value.name, message: redactText(value.message) };
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value instanceof Headers) {
    return redact(Object.fromEntries(value.entries()), depth + 1);
  }

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key)
      ? REDACTED
      : redact(inner, depth + 1);
  }
  return out;
}
