/*
 * Input cleaning for session metadata. Every value that reaches the database
 * passes through these helpers, whether it came from the connector or a paste.
 */

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const EXTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+=-]{0,199}$/;
const RESUME_COMMAND =
  /^(?:cd [A-Za-z0-9~/][A-Za-z0-9._~/-]{0,199} && )?(?:claude --resume|codex resume|opencode --session) [A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RAW_CONTROL = /[\u0000-\u001f\u007f]/;

export const MAX_RESUME_COMMAND = 300;

/**
 * Trims and strips control characters, then cuts to `max` code points.
 * Single-line fields turn line breaks into spaces; multiline fields keep them.
 * Returns null for non-strings and for values that are empty after cleaning.
 */
export function cleanText(value: unknown, max: number, multiline = false): string | null {
  if (typeof value !== "string") return null;
  const stripped = value.replace(CONTROL_CHARACTERS, "");
  const normalised = multiline
    ? stripped.replace(/\r\n?/g, "\n")
    : stripped.replace(/[\t\r\n]+/g, " ");
  const text = normalised.trim();
  if (!text) return null;
  return Array.from(text).slice(0, max).join("");
}

/** A timestamp as UTC ISO text, or null when it does not parse. */
export function parseTimestamp(value: unknown): string | null {
  const text = cleanText(value, 40);
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** A session id from the connector. Must start with a letter or digit. */
export function cleanExternalId(value: unknown): string | null {
  const text = cleanText(value, 200);
  return text && EXTERNAL_ID.test(text) ? text : null;
}

/**
 * Accepts only the documented resume forms, for example
 * `claude --resume <id>`, optionally prefixed by `cd <path> && `. Anything
 * else (shell syntax, extra flags, control characters) is dropped. The value
 * is only ever displayed and copied; the web app never runs it.
 */
export function sanitizeResumeCommand(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length > MAX_RESUME_COMMAND || RAW_CONTROL.test(value)) return null;
  const text = value.trim();
  return RESUME_COMMAND.test(text) ? text : null;
}
