import { HabitsPanel } from "@/components/track/plans-parts";
import { Panel } from "@/components/track/page";
import { todayStr } from "@/lib/dates";
import { habitCompletionToday } from "@/lib/plans/habits";
import { HabitTargetForm } from "./habit-target-form";

/** The existing habit grid, plus a weekly target and this week's count for each habit. */
export function HabitsTab() {
  const completion = habitCompletionToday(todayStr());
  return (
    <>
      <HabitsPanel />
      <Panel
        title="Weekly consistency"
        description="Check-ins this week against each habit's target. A habit with no target is shown without one."
      >
        {completion.habits.length === 0 ? (
          <p className="tk-empty">Add a habit above to set a weekly target.</p>
        ) : (
          <ul className="pl-target-list">
            {completion.habits.map((habit) => {
              const met = habit.target !== null && habit.weekCount >= habit.target;
              return (
                <li key={habit.id} data-met={met || undefined}>
                  <div>
                    <strong>{habit.name}</strong>
                    <span className="tk-mono">
                      {habit.weekCount}
                      {habit.target !== null ? ` of ${habit.target}` : ""} this week
                    </span>
                    {habit.target !== null ? (
                      <progress
                        max={habit.target}
                        value={Math.min(habit.weekCount, habit.target)}
                        aria-label={`${habit.name}: ${habit.weekCount} of ${habit.target} this week`}
                      />
                    ) : null}
                  </div>
                  <HabitTargetForm habitId={habit.id} habitName={habit.name} current={habit.target} />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
