import { EntityPanel } from "@/components/track/entity-panel";
import { Panel } from "@/components/track/page";
import { listRows } from "@/lib/crud";
import { todayStr } from "@/lib/dates";
import { isMeasurable, listFitnessGoals } from "@/lib/health/fitness";
import { TargetMeter } from "./target-meter";

/** Fitness goals: measured against the target for the last seven days only. */
export function GoalsTab() {
  const today = todayStr();
  const goals = listFitnessGoals(today);
  return (
    <>
      <Panel title="Fitness goals" description="Each goal compares the last seven days with its target. Metrics without a data source show no progress.">
        {goals.length === 0 ? (
          <p className="tk-empty">No fitness goals yet. Add one below.</p>
        ) : (
          <ul className="hl-goal-list">
            {goals.map((goal) => (
              <li key={goal.id} id={`fitness_goals-${goal.id}`} data-active={goal.active || undefined}>
                <div>
                  <strong>{goal.title}</strong>
                  <span className="hl-muted">
                    {goal.metric} · target {goal.target}
                    {goal.unit ? ` ${goal.unit}` : ""}
                    {goal.active ? "" : " · paused"}
                  </span>
                </div>
                {goal.progress.percent !== null && goal.measurement.measured !== null ? (
                  <>
                    <TargetMeter label={goal.title} percent={goal.progress.percent} met={goal.progress.met} />
                    <p className="hl-muted">
                      Measured {goal.measurement.measured} ({goal.measurement.basis.toLowerCase()}).
                    </p>
                  </>
                ) : isMeasurable(goal.metric) ? (
                  <p className="hl-muted">Nothing logged in the last seven days yet. {goal.measurement.basis}.</p>
                ) : (
                  <p className="hl-muted">{goal.measurement.basis}. Progress is not shown.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <EntityPanel
        entityKey="fitness_goals"
        title="Edit goals"
        description="Targets are yours to set. Sleep is measured in hours per night, water in millilitres per day."
        rows={listRows("fitness_goals")}
        columns={[
          { name: "title" },
          { name: "metric" },
          { name: "target" },
          { name: "unit" },
          { name: "active", inline: true },
        ]}
      />
    </>
  );
}
