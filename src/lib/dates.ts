/** Server-side date helpers. Dates are plain YYYY-MM-DD strings in one zone. */
const TZ = process.env.TRACK_TZ ?? "UTC";

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const hourFormat = new Intl.DateTimeFormat("en", {
  timeZone: TZ,
  hour: "numeric",
  hourCycle: "h23",
});

export const todayStr = (): string => dayFormat.format(new Date());

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The last `count` days ending at `end`, oldest first. */
export function lastDays(count: number, end: string = todayStr()): string[] {
  return Array.from({ length: count }, (_, i) => addDays(end, i - (count - 1)));
}

export function daysUntil(date: string, from: string = todayStr()): number {
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

export const monthStart = (date: string = todayStr()): string =>
  `${date.slice(0, 7)}-01`;

export function shortDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function longToday(): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

export function greeting(): string {
  const hour = Number(hourFormat.format(new Date()));
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Late night";
}

/** Formats a SQLite UTC timestamp ("YYYY-MM-DD HH:MM:SS") as local HH:MM. */
export function clockTime(createdAt: string): string {
  const parsed = new Date(`${createdAt.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(parsed);
}

export function isoDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}
