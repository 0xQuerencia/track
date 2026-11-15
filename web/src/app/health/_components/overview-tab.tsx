import Link from "next/link";
import { Panel, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { getHealthSnapshot } from "@/lib/health/aggregates";
import { listFitnessGoals } from "@/lib/health/fitness";
import { todayStr } from "@/lib/dates";
import { TargetMeter } from "./target-meter";
import { ConsistencyHeatmap, RingMeters, TrendChart } from "@/components/track/charts";
import { getDb } from "@/lib/db";
import { completenessDays, todayLog, weightSeries } from "@/lib/checkin/stats";

/** Overview: the numbers that matter this week, and the goals being tracked. */
export function OverviewTab() {
  const today = todayStr();
  const snapshot = getHealthSnapshot(today);
  const db = getDb();
  const weight = weightSeries(db, 90);
  const today_ = todayLog(db, today);
  const days = completenessDays(db, 12);
  const goals = listFitnessGoals(today).filter((goal) => goal.active).slice(0, 4);

  return (
    <>
      <StatGrid>
        <StatCard
          label="Sleep, 7-day avg"
          value={snapshot.sleepAvg7}
          decimals={1}
          suffix=" h"
          hint={snapshot.sleepNights7 ? `${snapshot.sleepNights7} logged nights` : "nothing logged"}
        />
        <StatCard
          label="Energy, 7-day avg"
          value={snapshot.energyAvg7}
          decimals={1}
          suffix="/5"
          hint={snapshot.energyDays7 ? `${snapshot.energyDays7} logged days` : "nothing logged"}
        />
        <StatCard label="Workouts this week" value={snapshot.workoutsThisWeek} />
        <StatCard
          label="Water today"
          value={snapshot.hydrationTodayMl}
          suffix=" ml"
          hint={snapshot.hydrationTodayMl === null ? "nothing logged yet" : undefined}
        />
      </StatGrid>
      <Panel title="Check-in and body" description="Built from your morning check-ins: weight over time, today against simple targets, and how complete each day's log is.">
        <div className="hl-checkin-grid">
          <section aria-label="Weight">
            <h3>Weight, 90 days</h3>
            <TrendChart data={weight} emptyNote="Log your weight in the morning check-in to see it here." />
          </section>
          <section aria-label="Today">
            <h3>Today</h3>
            <RingMeters
              size={200}
              rings={[
                { label: "Sleep (of 8 h)", value: today_.sleep ?? 0, maxValue: 8 },
                { label: "Energy (of 5)", value: today_.energy ?? 0, maxValue: 5 },
                { label: "Water (of 2.5 L)", value: today_.water ?? 0, maxValue: 2.5 },
              ]}
            />
          </section>
          <section aria-label="Log completeness" className="hl-checkin-wide">
            <h3>Log completeness, 12 weeks</h3>
            <ConsistencyHeatmap days={days} today={today} />
          </section>
        </div>
      </Panel>
      <Panel title="Fitness goals" description="Measured over the last seven days against each target. Only the period shown counts.">
        {goals.length === 0 ? (
          <p className="tk-empty">
            No active fitness goals. <Link href="/health?tab=goals">Set one</Link>.
          </p>
        ) : (
          <ul className="hl-goal-list">
            {goals.map((goal) => (
              <li key={goal.id}>
                <div>
                  <strong>{goal.title}</strong>
                  <span className="hl-muted">
                    {goal.metric} · target {goal.target}
                    {goal.unit ? ` ${goal.unit}` : ""}
                  </span>
                </div>
                {goal.progress.percent !== null ? (
                  <TargetMeter label={goal.title} percent={goal.progress.percent} met={goal.progress.met} />
                ) : (
                  <p className="hl-muted">{goal.measurement.basis}.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="hl-muted">
        Log sleep and energy on <Link href="/health?tab=sleep">Sleep &amp; Energy</Link>, workouts on{" "}
        <Link href="/health?tab=exercise">Exercise</Link>, and water on <Link href="/health?tab=hydration">Hydration</Link>.
      </p>
    </>
  );
}
