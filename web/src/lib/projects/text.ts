/** Removes control characters. Newlines and tabs survive only when `keepLines` is set. */
export function stripControl(value: string, keepLines = false): string {
  const pattern = keepLines
    ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
    : /[\u0000-\u001f\u007f]/g;
  return value.replace(pattern, " ").trim();
}

/** Joins tags the way the form stores them: trimmed, unique, ", " separated. */
export function joinTags(tags: readonly string[]): string | null {
  const unique = [...new Set(tags.map((tag) => stripControl(tag)).filter(Boolean))];
  return unique.length ? unique.join(", ") : null;
}

export function splitTags(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
