import { BarsChart, PALETTE } from "@/components/track/charts";
import { EntityPanel } from "@/components/track/entity-panel";
import { Panel } from "@/components/track/page";
import { listRows } from "@/lib/crud";
import { todayStr } from "@/lib/dates";
import { workoutsByWeek } from "@/lib/health/trends";

/** Sessions, a weekly count for the last eight weeks, and saved workout routines. */
export function ExerciseTab() {
  const weeks = workoutsByWeek(8, todayStr());
  return (
    <>
      <Panel title="Sessions per week" description="Workouts logged in each Monday-to-Sunday week, last eight weeks.">
        <BarsChart
          data={weeks.map((week) => ({ name: week.name, sessions: week.count }))}
          series={[{ key: "sessions", color: PALETTE[0] }]}
          emptyNote="Log a workout to see weekly sessions."
        />
      </Panel>
      <EntityPanel
        entityKey="workouts"
        title="Workouts"
        description="Personal training log. Minutes are required; intensity and notes are optional."
        rows={listRows("workouts")}
        columns={[
          { name: "date" },
          { name: "kind" },
          { name: "name" },
          { name: "minutes" },
          { name: "intensity" },
          { name: "notes" },
        ]}
      />
      <EntityPanel
        entityKey="workout_routines"
        title="Workout routines"
        description="Saved plans for a session: list the exercises as you like."
        rows={listRows("workout_routines")}
        columns={[{ name: "name" }, { name: "description" }, { name: "exercises" }]}
      />
    </>
  );
}
