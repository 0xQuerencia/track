/*
 * Display helpers. Values are shown exactly as stored; a missing value is
 * shown as a dash, never as a guess.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  const date = DATE_ONLY.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  const options: Intl.DateTimeFormatOptions = DATE_ONLY.test(value)
    ? { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }
    : { day: "numeric", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat("en", options).format(date);
}

/** Returns the value only when it is an http(s) link; anything else is shown as plain text. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^https?:\/\/\S+$/i.test(value) ? value : null;
}

/** "github.com/owner/repo" for display, without the scheme or .git suffix. */
export function repoLabel(value: string | null | undefined): string | null {
  const url = safeHttpUrl(value);
  if (!url) return value ?? null;
  return url.replace(/^https?:\/\//i, "").replace(/\.git$/i, "").replace(/\/$/, "");
}

/** Splits a stored comma list into display chips. */
export function chipsOf(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}
