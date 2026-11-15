import type { DatabaseSync } from "node:sqlite";
import { redactForAi } from "@/lib/ai";

const clip = (value: unknown, max = 90): string => redactForAi(String(value ?? ""), max);

/** The only personal data the assistant sends: short titles with ids, so it can refer to real records. */
export function buildContext(db: DatabaseSync, today: string) {
  const tasks = (db.prepare("SELECT id, title, due, priority FROM tasks WHERE COALESCE(status, '') != 'Done' ORDER BY due IS NULL, due, id LIMIT 25").all() as
    { id: number; title: string; due: string | null; priority: string | null }[])
    .map((t) => ({ id: t.id, title: clip(t.title), due: t.due, priority: t.priority }));
  const events = (db.prepare("SELECT id, title, date, start_time FROM events WHERE date >= ? ORDER BY date, start_time LIMIT 15").all(today) as
    { id: number; title: string; date: string; start_time: string | null }[])
    .map((e) => ({ id: e.id, title: clip(e.title), date: e.date, time: e.start_time }));
  const habits = (db.prepare("SELECT id, name FROM habits ORDER BY id LIMIT 15").all() as { id: number; name: string }[]).map((h) => ({ id: h.id, name: clip(h.name, 60) }));
  const goals = (db.prepare("SELECT id, title FROM goals WHERE status IN ('Active','Paused') ORDER BY id LIMIT 8").all() as { id: number; title: string }[]).map((g) => ({ id: g.id, title: clip(g.title, 80) }));
  return { tasks, events, habits, goals };
}

export function nowLabel(): { date: string; weekday: string; time: string } {
  const tz = process.env.TRACK_TZ?.trim() || undefined;
  const now = new Date();
  const parts = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }).format(now);
  const [d, m, y] = parts({ day: "2-digit", month: "2-digit", year: "numeric" }).split("/");
  return { date: `${y}-${m}-${d}`, weekday: parts({ weekday: "long" }), time: parts({ hour: "2-digit", minute: "2-digit", hour12: false }) };
}
