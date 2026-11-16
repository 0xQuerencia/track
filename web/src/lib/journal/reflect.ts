/*
 * Reflection aggregates for the week and month views. Only counts and
 * averages of recorded values: no inferred mood, no generated insights.
 */

export type ReflectionView = "week" | "month";

export type ReflectionEntry = {
  date: string;
  mood: number | null;
  energy: number | null;
  win: string | null;
  setback: string | null;
  tags: string | null;
};

export type TagCount = { tag: string; count: number };

export type ReflectionSummary = {
  entries: number;
  daysWithEntries: number;
  wins: number;
  setbacks: number;
  /** Mean of the recorded mood values, one decimal. Null when no entry has a mood. */
  moodAverage: number | null;
  moodCount: number;
  energyAverage: number | null;
  energyCount: number;
  tags: TagCount[];
};

const TOP_TAGS = 10;

const oneDecimal = (value: number): number => Math.round(value * 10) / 10;

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Splits a comma-separated tag string into trimmed, non-empty tags. */
export function splitTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/**
 * How often each tag appears across entries. Tags are compared ignoring case;
 * the spelling shown is the first one seen. Sorted by count, then name.
 */
export function tagFrequency(entries: readonly Pick<ReflectionEntry, "tags">[], limit = TOP_TAGS): TagCount[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const entry of entries) {
    const seenInEntry = new Set<string>();
    for (const tag of splitTags(entry.tags)) {
      const key = tag.toLowerCase();
      if (seenInEntry.has(key)) continue;
      seenInEntry.add(key);
      const current = counts.get(key);
      if (current) current.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

/** Totals and averages for a set of entries in one period. */
export function summarizeEntries(entries: readonly ReflectionEntry[]): ReflectionSummary {
  const moods = entries.map((entry) => entry.mood).filter(isNumber);
  const energies = entries.map((entry) => entry.energy).filter(isNumber);
  const average = (values: number[]) =>
    values.length === 0 ? null : oneDecimal(values.reduce((acc, value) => acc + value, 0) / values.length);
  return {
    entries: entries.length,
    daysWithEntries: new Set(entries.map((entry) => entry.date)).size,
    wins: entries.filter((entry) => entry.win && entry.win.trim() !== "").length,
    setbacks: entries.filter((entry) => entry.setback && entry.setback.trim() !== "").length,
    moodAverage: average(moods),
    moodCount: moods.length,
    energyAverage: average(energies),
    energyCount: energies.length,
    tags: tagFrequency(entries),
  };
}

/** The date range a view covers: the last seven days, or the calendar month so far. */
export function reflectionRange(view: ReflectionView, today: string): { start: string; end: string; label: string } {
  if (view === "month") {
    const start = `${today.slice(0, 7)}-01`;
    return { start, end: today, label: "This month so far" };
  }
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 6);
  return { start: date.toISOString().slice(0, 10), end: today, label: "The last seven days" };
}
