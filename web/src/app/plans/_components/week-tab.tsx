import Link from "next/link";
import { Panel, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { shortDay } from "@/lib/dates";
import { shiftWeek, weekEndOf } from "@/lib/plans/week";
import { loadWeeklyPlan, weekSummary } from "@/lib/plans/weekly";
import { WeeklyPlanForm } from "./weekly-form";

/** Weekly plan: intentions for the week, then a review prefilled from real counts. */
export function WeekTab({ weekStart }: { weekStart: string }) {
  const end = weekEndOf(weekStart);
  const summary = weekSummary(weekStart);
  const plan = loadWeeklyPlan(weekStart);
  const counted =
    `This week: ${summary.tasksCompleted} ${summary.tasksCompleted === 1 ? "task" : "tasks"} completed, ` +
    `${summary.habitCheckIns} habit ${summary.habitCheckIns === 1 ? "check-in" : "check-ins"}.`;
  const reflectionDefault = plan?.reflection ?? `${counted}\n\nWhat went well:\n\nWhat to change:`;

  return (
    <div className="pl-week">
      <nav className="pl-week-nav" aria-label="Choose week">
        <Link href={`/plans?tab=week&week=${shiftWeek(weekStart, -1)}`}>← Previous week</Link>
        <h2>
          {shortDay(weekStart)} – {shortDay(end)}
        </h2>
        <Link href={`/plans?tab=week&week=${shiftWeek(weekStart, 1)}`}>Next week →</Link>
      </nav>
      <StatGrid>
        <StatCard label="Tasks completed" value={summary.tasksCompleted} hint="finished on the web this week" />
        <StatCard label="Still open, due this week" value={summary.tasksStillOpen} />
        <StatCard label="Habit check-ins" value={summary.habitCheckIns} />
      </StatGrid>
      <Panel title="Habit completion" description="Check-ins this week against each habit's target.">
        {summary.habits.length === 0 ? (
          <p className="tk-empty">No habits yet.</p>
        ) : (
          <ul className="pl-week-habits">
            {summary.habits.map((habit) => (
              <li key={habit.id}>
                <span>{habit.name}</span>
                <span className="tk-mono">
                  {habit.count}
                  {habit.target !== null ? ` of ${habit.target}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Plan and review" description="Saved for this week only. Edit any time.">
        <WeeklyPlanForm
          weekStart={weekStart}
          intentions={plan?.intentions ?? ""}
          top3={plan?.top3 ?? ""}
          reflection={reflectionDefault}
        />
      </Panel>
    </div>
  );
}
