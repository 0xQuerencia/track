import { lastDays } from "../dates";
import { getDb } from "../db";
import { listRows } from "../crud";
import { MEASURABLE_METRICS, type FitnessMetric } from "./constants";
import { round1, workoutCount } from "./aggregates";

/*
 * Fitness goals compare a value measured over the last seven days with the
 * target. Metrics without a data source here report no measurement at all.
 */

export type Measurement = {
  measured: number | null;
  /** What the measurement is, in plain words. */
  basis: string;
  /** Number of logged rows or days behind the measurement. */
  samples: number;
};

export type FitnessProgress = {
  /** Measured as a share of the target, uncapped. Null without a measurement. */
  percent: number | null;
  met: boolean;
};

const WINDOW_DAYS = 7;

export function measureMetric(metric: FitnessMetric, today: string): Measurement {
  const start = lastDays(WINDOW_DAYS, today)[0];
  switch (metric) {
    case "Workouts per week": {
      const count = workoutCount(start, today);
      return { measured: count, basis: "Workouts in the last 7 days", samples: count };
    }
    case "Sleep hours": {
      const row = getDb()
        .prepare(
          `SELECT AVG(sleep_hours) AS avg, COUNT(sleep_hours) AS n FROM health_logs
           WHERE date BETWEEN ? AND ? AND sleep_hours IS NOT NULL`,
        )
        .get(start, today) as { avg: number | null; n: number };
      return {
        measured: row.avg === null ? null : round1(Number(row.avg)),
        basis: "Average of logged nights, last 7 days",
        samples: Number(row.n),
      };
    }
    case "Water ml": {
      const row = getDb()
        .prepare(
          `SELECT AVG(total) AS avg, COUNT(*) AS days FROM (
             SELECT date, SUM(ml) AS total FROM hydration_logs
             WHERE date BETWEEN ? AND ? GROUP BY date)`,
        )
        .get(start, today) as { avg: number | null; days: number };
      return {
        measured: row.avg === null ? null : Math.round(Number(row.avg)),
        basis: "Average per logged day, last 7 days",
        samples: Number(row.days),
      };
    }
    case "Steps":
    case "Custom":
      return { measured: null, basis: "No data source for this metric yet", samples: 0 };
  }
}

export function fitnessProgress(target: number, measured: number | null): FitnessProgress {
  if (measured === null || target <= 0) return { percent: null, met: false };
  return {
    percent: Math.round((measured / target) * 100),
    met: measured >= target,
  };
}

export type FitnessGoalView = {
  id: number;
  title: string;
  metric: FitnessMetric;
  target: number;
  unit: string | null;
  active: boolean;
  measurement: Measurement;
  progress: FitnessProgress;
};

export function listFitnessGoals(today: string): FitnessGoalView[] {
  const rows = listRows("fitness_goals") as unknown as {
    id: number;
    title: string;
    metric: FitnessMetric;
    target: number;
    unit: string | null;
    active: number;
  }[];
  return rows.map((row) => {
    const measurement = measureMetric(row.metric, today);
    return {
      id: row.id,
      title: row.title,
      metric: row.metric,
      target: Number(row.target),
      unit: row.unit,
      active: row.active === 1,
      measurement,
      progress: fitnessProgress(Number(row.target), measurement.measured),
    };
  });
}

export const isMeasurable = (metric: FitnessMetric): boolean =>
  (MEASURABLE_METRICS as readonly string[]).includes(metric);
