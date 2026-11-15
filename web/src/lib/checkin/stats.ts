import type { DatabaseSync } from "node:sqlite";

export type WeightPoint = { date: string; value: number };

export function weightSeries(db: DatabaseSync, days = 90): WeightPoint[] {
  return (db.prepare(
    `SELECT date, AVG(weight_kg) AS value FROM body_measurements
     WHERE date >= date('now', ?) GROUP BY date ORDER BY date`,
  ).all(`-${days} days`) as WeightPoint[]).map((r) => ({ date: r.date, value: Math.round(r.value * 10) / 10 }));
}

export function sleepSeries(db: DatabaseSync, days = 30): WeightPoint[] {
  return (db.prepare(
    `SELECT date, AVG(sleep_hours) AS value FROM health_logs
     WHERE sleep_hours IS NOT NULL AND date >= date('now', ?) GROUP BY date ORDER BY date`,
  ).all(`-${days} days`) as WeightPoint[]).map((r) => ({ date: r.date, value: Math.round(r.value * 100) / 100 }));
}

/** Per day: how many of sleep, energy, water, workout, meals, weight were logged (0-6). */
export function completenessDays(db: DatabaseSync, weeks = 12): { date: string; count: number }[] {
  const rows = db.prepare(
    `SELECT l.date AS date,
       (l.sleep_hours IS NOT NULL) + (l.energy IS NOT NULL) + (l.water_l IS NOT NULL)
       + (l.workout IS NOT NULL AND l.workout != '') + (l.meals IS NOT NULL AND l.meals != '')
       + EXISTS (SELECT 1 FROM body_measurements b WHERE b.date = l.date) AS count
     FROM health_logs l WHERE l.date >= date('now', ?) GROUP BY l.date`,
  ).all(`-${weeks * 7} days`) as { date: string; count: number }[];
  // node:sqlite rows have a null prototype; client components need plain objects.
  return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
}

export function todayLog(db: DatabaseSync, today: string): { sleep: number | null; energy: number | null; water: number | null } {
  const row = db.prepare("SELECT sleep_hours, energy, water_l FROM health_logs WHERE date = ? ORDER BY id DESC LIMIT 1").get(today) as
    | { sleep_hours: number | null; energy: number | null; water_l: number | null }
    | undefined;
  return { sleep: row?.sleep_hours ?? null, energy: row?.energy ?? null, water: row?.water_l ?? null };
}
