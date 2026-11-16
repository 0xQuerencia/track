/** Display helpers shared by server pages and client components. No database imports. */

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "15 Nov 2026, 09:00", or an em dash when the value is missing or invalid. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "—" : WHEN.format(new Date(ms));
}

/** Parses a positive integer id from form data, or null. */
export function parseId(value: FormDataEntryValue | null): number | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,12}$/.test(text)) return null;
  const id = Number(text);
  return id > 0 ? id : null;
}
