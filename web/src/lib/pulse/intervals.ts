import {CATEGORIES,type Category} from "./classification";
export type ActivitySource = "browser" | "desktop" | "android" | "editor" | "manual";
export type ActivityInterval = Readonly<{
  eventId: string;
  deviceId: string;
  source: ActivitySource;
  category?: Category;
  startMs: number;
  endMs: number;
}>;
export type TimeWindow = Readonly<{ startMs: number; endMs: number }>;
const SOURCES = new Set(["browser", "desktop", "android", "editor", "manual"]);
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ID = /^[a-zA-Z0-9_-]{1,128}$/;

function validWindow(w: TimeWindow): boolean {
  return Number.isSafeInteger(w.startMs) && Number.isSafeInteger(w.endMs)
    && w.startMs >= 0 && w.endMs > w.startMs;
}

/** Only explicitly allowed metadata crosses the activity boundary. */
export function parseActivityInterval(input: unknown): ActivityInterval | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const v = input as Record<string, unknown>;
  if (Object.keys(v).some(k => !["eventId","deviceId","source","startMs","endMs","category"].includes(k))) return null;
  if (typeof v.eventId !== "string" || !ID.test(v.eventId)
      || typeof v.deviceId !== "string" || !ID.test(v.deviceId)
      || typeof v.source !== "string" || !SOURCES.has(v.source)
      || (v.category!==undefined && !CATEGORIES.includes(v.category as Category))
      || typeof v.startMs !== "number" || typeof v.endMs !== "number") return null;
  const result = { eventId: v.eventId, deviceId: v.deviceId, source: v.source as ActivitySource,
    startMs: v.startMs, endMs: v.endMs, ...(v.category===undefined?{}:{category:v.category as Category}) };
  return validWindow(result) && result.endMs - result.startMs <= MAX_INTERVAL_MS ? result : null;
}

/** Half-open intervals; adjacent ranges merge, but unknown gaps remain unknown. */
export function unionIntervals(intervals: readonly TimeWindow[], window?: TimeWindow): TimeWindow[] {
  if (window && !validWindow(window)) throw new RangeError("Invalid reporting window");
  const sorted = intervals.map(i => {
    if (!validWindow(i)) throw new RangeError("Invalid activity interval");
    return { startMs: Math.max(i.startMs, window?.startMs ?? i.startMs),
      endMs: Math.min(i.endMs, window?.endMs ?? i.endMs) };
  }).filter(i => i.endMs > i.startMs).sort((a,b) => a.startMs-b.startMs || a.endMs-b.endMs);
  const merged: { startMs: number; endMs: number }[] = [];
  for (const i of sorted) {
    const last = merged.at(-1);
    if (last && i.startMs <= last.endMs) last.endMs = Math.max(last.endMs, i.endMs);
    else merged.push({ ...i });
  }
  return merged;
}
export function uniqueTimeMs(intervals: readonly TimeWindow[], window?: TimeWindow): number {
  return unionIntervals(intervals, window).reduce((sum, i) => sum + i.endMs - i.startMs, 0);
}
export function activityTotals(intervals: readonly ActivityInterval[], window?: TimeWindow) {
  const devices = new Map<string, ActivityInterval[]>();
  const events = new Map<string, ActivityInterval>();
  for (const raw of intervals) {
    const i = parseActivityInterval(raw);
    if (!i) throw new RangeError("Invalid activity metadata");
    const key = i.deviceId + ":" + i.eventId;
    const previous = events.get(key);
    if (previous) {
      if (previous.startMs !== i.startMs || previous.endMs !== i.endMs || previous.source !== i.source || previous.category !== i.category)
        throw new Error("Conflicting event replay");
      continue;
    }
    events.set(key,i);
    const list = devices.get(i.deviceId) ?? [];
    list.push(i);
    devices.set(i.deviceId,list);
  }
  return {
    uniqueMs: uniqueTimeMs([...events.values()], window),
    byDevice: Object.fromEntries([...devices].map(([id,list]) => [id, uniqueTimeMs(list,window)])),
  };
}
