import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db";
import { calendarTimeZone } from "../calendar/time";
import { DEFAULT_SETTINGS, type QvSettings } from "./constants";

/** Settings are stored as JSON strings by key; anything missing or invalid falls back to the default. */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function zoneOk(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Validates a partial settings object. Returns the cleaned values or the first error. */
export function cleanSettings(input: Partial<Record<keyof QvSettings, unknown>>): { ok: true; value: Partial<QvSettings> } | { ok: false; error: string } {
  const out: Partial<QvSettings> = {};
  const int = (key: keyof QvSettings, min: number, max: number, label: string): string | null => {
    if (input[key] === undefined) return null;
    const n = Number(input[key]);
    if (!Number.isInteger(n) || n < min || n > max) return `${label} must be a whole number from ${min} to ${max}.`;
    (out as Record<string, unknown>)[key] = n;
    return null;
  };
  const time = (key: keyof QvSettings, label: string): string | null => {
    if (input[key] === undefined) return null;
    if (typeof input[key] !== "string" || !HHMM.test(input[key] as string)) return `${label} must be a time like 06:00.`;
    (out as Record<string, unknown>)[key] = input[key];
    return null;
  };
  const errors = [
    int("redDays", 1, 30, "Red interval"),
    int("yellowDays", 1, 60, "Yellow interval"),
    int("greenDays", 1, 120, "Green interval"),
    int("maxIntervalDays", 7, 365, "Longest interval"),
    int("examWindowDays", 0, 365, "Exam window"),
    int("maxDailyReviews", 5, 300, "Daily review cap"),
    int("weekdayMinutes", 0, 960, "Weekday study minutes"),
    int("weekendMinutes", 0, 960, "Weekend study minutes"),
    int("minutesPerQuestion", 1, 30, "Minutes per question"),
    int("practiceBlockQuestions", 5, 100, "Practice block size"),
    int("taskMinutes", 10, 240, "Task minutes"),
    int("weeklyDay", 0, 6, "Weekly review day"),
    time("dayStart", "Day start"),
    time("dayEnd", "Day end"),
    time("planTime", "Plan time"),
    time("reminderTime", "Reminder time"),
    time("eveningTime", "Evening check time"),
    time("weeklyTime", "Weekly review time"),
  ].filter((e): e is string => e !== null);
  if (errors.length) return { ok: false, error: errors[0] };
  if (input.timezone !== undefined) {
    if (typeof input.timezone !== "string" || !zoneOk(input.timezone)) return { ok: false, error: "Unknown time zone." };
    out.timezone = input.timezone;
  }
  if (input.jobsEnabled !== undefined) out.jobsEnabled = Boolean(input.jobsEnabled);
  if (input.ladder !== undefined) {
    const ladder = Array.isArray(input.ladder) ? input.ladder.map(Number) : [];
    const ascending = ladder.every((n, i) => Number.isInteger(n) && n >= 1 && (i === 0 || n > ladder[i - 1]));
    if (ladder.length < 2 || ladder.length > 12 || !ascending) return { ok: false, error: "Ladder needs 2-12 increasing whole days, e.g. 1,3,7,14,30,60." };
    out.ladder = ladder;
  }
  const merged = { ...DEFAULT_SETTINGS, ...out };
  if ((out.dayStart || out.dayEnd) && merged.dayStart >= merged.dayEnd) return { ok: false, error: "Day start must be before day end." };
  return { ok: true, value: out };
}

export function getSettings(db: DatabaseSync = getDb()): QvSettings {
  const rows = db.prepare("SELECT key, value FROM qv_settings").all() as { key: string; value: string }[];
  const stored: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      stored[row.key] = JSON.parse(row.value);
    } catch {
      // A corrupt value is ignored; the default applies.
    }
  }
  const cleaned = cleanSettings(stored as Partial<Record<keyof QvSettings, unknown>>);
  // One bad stored value must not hide the good ones: re-check key by key.
  let value: Partial<QvSettings> = cleaned.ok ? cleaned.value : {};
  if (!cleaned.ok) {
    for (const [key, v] of Object.entries(stored)) {
      const single = cleanSettings({ [key]: v } as Partial<Record<keyof QvSettings, unknown>>);
      if (single.ok) value = { ...value, ...single.value };
    }
  }
  return { ...DEFAULT_SETTINGS, timezone: calendarTimeZone(), ...value };
}

export function saveSettings(input: Partial<Record<keyof QvSettings, unknown>>, db: DatabaseSync = getDb()): { ok: true } | { ok: false; error: string } {
  const cleaned = cleanSettings(input);
  if (!cleaned.ok) return cleaned;
  const upsert = db.prepare("INSERT INTO qv_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const [key, value] of Object.entries(cleaned.value)) upsert.run(key, JSON.stringify(value));
  return { ok: true };
}
