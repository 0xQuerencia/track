/*
 * Money conventions for this module.
 *
 * Amounts are stored as REAL rupees in the existing transactions and budget
 * columns (not changed). Every calculation converts each stored value to
 * integer paise first (Math.round(rupees * 100)) and sums integers, so totals
 * never drift by floating-point error. Results are turned back into rupees
 * only for display or export.
 */

export const CURRENCY = "INR" as const;
export const LOCALE = "en-IN";

const rupeeFormat = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 2,
});

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Rupees (any float) to integer paise. */
export const toPaise = (rupees: number): number => Math.round(rupees * 100);

/** Integer paise to rupees, for display and export only. */
export const fromPaise = (paise: number): number => paise / 100;

/** Formats rupees or paise for display. Pass `paise: true` for integer paise input. */
export function formatMoney(value: number, options: { paise?: boolean } = {}): string {
  const paise = options.paise ? value : toPaise(value);
  return rupeeFormat.format(fromPaise(paise));
}

/** True for a "YYYY-MM" string that names a real month. */
export function isMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH.test(value);
}

/** The month the given date falls in, as "YYYY-MM". */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** First day and exclusive end day ("YYYY-MM-DD") of a "YYYY-MM" month. */
export function monthRange(month: string): { start: string; end: string } {
  const match = MONTH.exec(month);
  if (!match) throw new RangeError(`Not a YYYY-MM month: ${month}`);
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  const start = new Date(Date.UTC(year, index, 1));
  const end = new Date(Date.UTC(year, index + 1, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** A readable name for a "YYYY-MM" month, e.g. "November 2026". */
export function monthLabel(month: string): string {
  const match = MONTH.exec(month);
  if (!match) return month;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)).toLocaleDateString(LOCALE, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Shifts a "YYYY-MM" month by whole months. */
export function addMonthsToMonth(month: string, delta: number): string {
  const { start } = monthRange(month);
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}
