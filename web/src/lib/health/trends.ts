import { getDb } from "../db";
import { lastDays } from "../dates";
import { addMonths } from "../plans/recurrence";
import { weekStartOf, shiftWeek, weekEndOf } from "../plans/week";
import { round1 } from "./aggregates";

/* Trend series for the charts. Only periods with real rows produce points. */

export type DatedValue = { date: string; value: number };

/** Daily averages of a health_logs column over the last `days` days, logged days only. */
export function dailySeries(column: "sleep_hours" | "energy", days: number, today: string): DatedValue[] {
  const span = lastDays(days, today);
  return (
    getDb()
      .prepare(
        `SELECT date, AVG("${column}") AS v FROM health_logs
         WHERE date BETWEEN ? AND ? AND "${column}" IS NOT NULL
         GROUP BY date ORDER BY date`,
      )
      .all(span[0], span[span.length - 1]) as { date: string; v: number }[]
  ).map((row) => ({ date: row.date, value: round1(Number(row.v)) ?? 0 }));
}

/**
 * Monthly averages over the last `months` calendar months. Each point is the
 * first day of its month, so charts can share the date axis.
 */
export function monthlySeries(column: "sleep_hours" | "energy", months: number, today: string): DatedValue[] {
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  const start = addMonths(firstOfMonth, -(months - 1));
  return (
    getDb()
      .prepare(
        `SELECT substr(date, 1, 7) AS month, AVG("${column}") AS v FROM health_logs
         WHERE date >= ? AND date <= ? AND "${column}" IS NOT NULL
         GROUP BY month ORDER BY month`,
      )
      .all(start, today) as { month: string; v: number }[]
  ).map((row) => ({ date: `${row.month}-01`, value: round1(Number(row.v)) ?? 0 }));
}

export type WeekPoint = { weekStart: string; name: string; count: number; minutes: number };

/** Workouts and minutes per Monday-to-Sunday week for the last `weeks` weeks, empty weeks included. */
export function workoutsByWeek(weeks: number, today: string): WeekPoint[] {
  const first = shiftWeek(weekStartOf(today), -(weeks - 1));
  const rows = getDb()
    .prepare(
      `SELECT date, COUNT(*) AS n, SUM(COALESCE(minutes, 0)) AS mins FROM workouts
       WHERE date BETWEEN ? AND ? GROUP BY date`,
    )
    .all(first, today) as { date: string; n: number; mins: number }[];
  return Array.from({ length: weeks }, (_, index) => {
    const weekStart = shiftWeek(first, index);
    const end = weekEndOf(weekStart);
    const inWeek = rows.filter((row) => row.date >= weekStart && row.date <= end);
    return {
      weekStart,
      name: weekStart.slice(5),
      count: inWeek.reduce((sum, row) => sum + Number(row.n), 0),
      minutes: inWeek.reduce((sum, row) => sum + Number(row.mins), 0),
    };
  });
}

export type DayTotal = { date: string; name: string; ml: number };

/** Millilitres per day for the last `days` days, zero where nothing was logged. */
export function hydrationByDay(days: number, today: string): DayTotal[] {
  const span = lastDays(days, today);
  const rows = getDb()
    .prepare(
      `SELECT date, SUM(ml) AS total FROM hydration_logs
       WHERE date BETWEEN ? AND ? GROUP BY date`,
    )
    .all(span[0], span[span.length - 1]) as { date: string; total: number }[];
  const byDate = new Map(rows.map((row) => [row.date, Number(row.total)]));
  return span.map((date) => ({ date, name: date.slice(5), ml: byDate.get(date) ?? 0 }));
}
