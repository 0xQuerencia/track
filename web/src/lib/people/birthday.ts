import { daysInMonth, type MonthDay } from "./occurrences";

/*
 * Birthday text is stored as MM-DD or YYYY-MM-DD. The database CHECK only
 * verifies the shape; this checks that the month and day exist.
 */

export type BirthdayParse =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

const MD = /^(\d{2})-(\d{2})$/;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
/** A leap year, so that MM-DD input of 02-29 is accepted. */
const LEAP_REFERENCE_YEAR = 2000;

/** Validates a birthday typed by a user. Empty input means "no birthday". */
export function parseBirthday(raw: string | null | undefined): BirthdayParse {
  const text = (raw ?? "").trim();
  if (!text) return { ok: true, value: null };

  const md = MD.exec(text);
  if (md) {
    const month = Number(md[1]);
    const day = Number(md[2]);
    if (!validMonthDay(month, day, LEAP_REFERENCE_YEAR))
      return { ok: false, error: "Birthday is not a real date." };
    return { ok: true, value: text };
  }

  const ymd = YMD.exec(text);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (year < MIN_YEAR || year > MAX_YEAR)
      return { ok: false, error: `Birthday year must be between ${MIN_YEAR} and ${MAX_YEAR}.` };
    if (!validMonthDay(month, day, year))
      return { ok: false, error: "Birthday is not a real date." };
    return { ok: true, value: text };
  }

  return { ok: false, error: "Birthday must be MM-DD or YYYY-MM-DD." };
}

function validMonthDay(month: number, day: number, year: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** The month and day of a stored birthday (MM-DD or YYYY-MM-DD). */
export function monthDayOf(birthday: string): MonthDay {
  const parts = birthday.split("-");
  return {
    month: Number(parts[parts.length - 2]),
    day: Number(parts[parts.length - 1]),
  };
}
