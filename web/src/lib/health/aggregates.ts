import { getDb } from "../db";
import { lastDays } from "../dates";
import { weekStartOf } from "../plans/week";

/*
 * Health aggregates over real rows only. An average with no logged days is
 * null, never zero, so an empty period reads as "nothing logged".
 */

export type HealthSnapshot = {
  date: string;
  sleepAvg7: number | null;
  sleepNights7: number;
  energyAvg7: number | null;
  energyDays7: number;
  workoutsThisWeek: number;
  hydrationTodayMl: number | null;
};

export const round1 = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 10) / 10;

/** Average of a health_logs column over an inclusive date range, ignoring blank days. */
export function healthAverage(
  column: "sleep_hours" | "energy",
  start: string,
  end: string,
): { avg: number | null; days: number } {
  const row = getDb()
    .prepare(
      `SELECT AVG("${column}") AS avg, COUNT("${column}") AS n FROM health_logs
       WHERE date BETWEEN ? AND ? AND "${column}" IS NOT NULL`,
    )
    .get(start, end) as { avg: number | null; n: number };
  return { avg: row.avg === null ? null : round1(Number(row.avg)), days: Number(row.n) };
}

export function workoutCount(start: string, end: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM workouts WHERE date BETWEEN ? AND ?")
    .get(start, end) as { n: number };
  return Number(row.n);
}

/** Total millilitres logged on one day, or null when nothing was logged. */
export function hydrationOn(date: string): number | null {
  const row = getDb()
    .prepare("SELECT SUM(ml) AS total, COUNT(*) AS n FROM hydration_logs WHERE date = ?")
    .get(date) as { total: number | null; n: number };
  return Number(row.n) === 0 ? null : Number(row.total);
}

/** The overview numbers: 7-day sleep and energy, this week's workouts, today's water. */
export function getHealthSnapshot(today: string): HealthSnapshot {
  const start = lastDays(7, today)[0];
  const sleep = healthAverage("sleep_hours", start, today);
  const energy = healthAverage("energy", start, today);
  return {
    date: today,
    sleepAvg7: sleep.avg,
    sleepNights7: sleep.days,
    energyAvg7: energy.avg,
    energyDays7: energy.days,
    workoutsThisWeek: workoutCount(weekStartOf(today), today),
    hydrationTodayMl: hydrationOn(today),
  };
}

