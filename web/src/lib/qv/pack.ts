/*
 * Packs study blocks into the free time of one day. Pure: minutes since midnight in, minutes out.
 *
 * Free time = [dayStart, dayEnd] minus busy intervals (calendar events, locked blocks) and, for today,
 * minus whatever has already passed. Candidates are placed highest priority first, first-fit in the
 * earliest window ("early") or the latest ("late"). A block that does not fit its estimate may shrink
 * to its minimum; one that still cannot fit is deferred with the reason, never silently dropped.
 */

export type Busy = { start: number; end: number };

export type Candidate = {
  key: string;
  kind: string;
  title: string;
  detail: string | null;
  minutes: number;
  minMinutes: number;
  priority: number;
  prefer: "early" | "late";
  chapterId: number | null;
  questionIds: number[];
  taskId: number | null;
  reason: string | null;
};

export type Placed = Candidate & { start: number; end: number };
export type Deferred = Candidate & { deferReason: string };

const GAP = 5;
const round5 = (n: number) => Math.round(n / 5) * 5;

export const toMin = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const toClock = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function freeWindows(dayStart: number, dayEnd: number, busy: readonly Busy[], notBefore = 0): Busy[] {
  let windows: Busy[] = [{ start: Math.max(dayStart, round5(Math.ceil(notBefore / 5) * 5)), end: dayEnd }];
  for (const b of [...busy].sort((x, y) => x.start - y.start)) {
    windows = windows.flatMap((w) => {
      if (b.end <= w.start || b.start >= w.end) return [w];
      const out: Busy[] = [];
      if (b.start - w.start > 0) out.push({ start: w.start, end: b.start });
      if (w.end - b.end > 0) out.push({ start: b.end, end: w.end });
      return out;
    });
  }
  return windows.filter((w) => w.end - w.start >= 5);
}

export function packDay(input: { windows: Busy[]; candidates: readonly Candidate[]; budgetMinutes: number }): { placed: Placed[]; deferred: Deferred[] } {
  let windows = input.windows.map((w) => ({ ...w }));
  let budget = input.budgetMinutes;
  const placed: Placed[] = [];
  const deferred: Deferred[] = [];
  const ordered = [...input.candidates].sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));

  for (const c of ordered) {
    let minutes = round5(c.minutes);
    if (minutes > budget) minutes = Math.floor(budget / 5) * 5;
    if (minutes < Math.min(c.minMinutes, c.minutes) || minutes <= 0) {
      deferred.push({ ...c, deferReason: "Over today's study time" });
      continue;
    }
    const fits = (w: Busy, m: number) => w.end - w.start >= m;
    let size = minutes;
    let index = c.prefer === "early" ? windows.findIndex((w) => fits(w, size)) : windows.map((w) => fits(w, size)).lastIndexOf(true);
    if (index < 0) {
      const largest = windows.reduce((best, w) => Math.max(best, w.end - w.start), 0);
      size = Math.floor(largest / 5) * 5;
      if (size >= Math.min(c.minMinutes, minutes) && size > 0) index = windows.findIndex((w) => w.end - w.start >= size);
    }
    if (index < 0) {
      deferred.push({ ...c, deferReason: "No free slot big enough today" });
      continue;
    }
    const w = windows[index];
    const start = w.start;
    placed.push({ ...c, minutes: size, start, end: start + size });
    budget -= size;
    const rest = { start: start + size + GAP, end: w.end };
    windows = [...windows.slice(0, index), ...(rest.end - rest.start >= 5 ? [rest] : []), ...windows.slice(index + 1)];
  }
  placed.sort((a, b) => a.start - b.start);
  return { placed, deferred };
}
