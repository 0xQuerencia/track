import Link from "next/link";
import { Panel, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { listRows } from "@/lib/crud";
import { addDays, lastDays, shortDay, todayStr } from "@/lib/dates";
import { getGoalSummaries, getHabitCompletionToday, getOverdueTasks, getTodayPriorities } from "@/lib/plans";
import { taskCounts } from "@/lib/queries";
import { ProgressMeter } from "./progress-meter";

/** Today: the numbers and lists that answer "what now". Every value is read from real rows. */
export function TodayTab() {
  const today = todayStr();
  const counts = taskCounts();
  const habits = getHabitCompletionToday(today);
  const priorities = getTodayPriorities(today, 6);
  const overdue = getOverdueTasks(today);
  const goals = getGoalSummaries(4);
  const tasks = listRows("tasks");
  const nextWeek = lastDays(7, addDays(today, 6));

  return (
    <>
      <StatGrid>
        <StatCard label="Open tasks" value={counts.open} />
        <StatCard label="Due today" value={counts.dueToday} />
        <StatCard label="Overdue" value={counts.overdue} tone={counts.overdue > 0 ? "negative" : undefined} />
        <StatCard label="Habits today" value={habits.done} hint={habits.total ? `of ${habits.total}` : "no habits yet"} />
      </StatGrid>
      <div className="pl-two-up">
        <Panel title="Priorities" description="Overdue and due-today tasks first, then undated ones by priority.">
          {priorities.length === 0 ? (
            <p className="tk-empty">Nothing queued. <Link href="/plans?new=task">Add a task</Link>.</p>
          ) : (
            <ol className="tk-priorities">
              {priorities.map((task) => (
                <li key={task.id} data-priority={String(task.priority ?? "")}>
                  <span>{task.title}</span>
                  <small>
                    {task.priority ?? ""}
                    {task.due ? ` · ${task.due < today ? "overdue since" : "due"} ${shortDay(task.due)}` : ""}
                  </small>
                </li>
              ))}
            </ol>
          )}
          {overdue.length > 0 ? (
            <p className="pl-note">
              {overdue.length} overdue. <Link href="/plans?tab=tasks">Review them on the board.</Link>
            </p>
          ) : null}
        </Panel>
        <Panel title="Goals in focus" description="Active goals, with progress from linked work.">
          {goals.length === 0 ? (
            <p className="tk-empty">No active goals. <Link href="/plans?tab=goals">Add one</Link>.</p>
          ) : (
            <ul className="pl-goal-summaries">
              {goals.map((goal) => (
                <li key={goal.id}>
                  <Link href={`/plans?tab=goals#goals-${goal.id}`}>{goal.title}</Link>
                  <ProgressMeter progress={goal.progress} />
                  {goal.reviewDue ? <span className="pl-badge">Review due</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <Panel title="This week" description="Open tasks by due date, today and the next six days.">
        <ol className="tk-week">
          {nextWeek.map((date) => {
            const due = tasks.filter((t) => t.status !== "Done" && t.due === date);
            return (
              <li key={date} data-today={date === today || undefined}>
                <h3>{date === today ? "Today" : shortDay(date)}</h3>
                {due.length === 0 ? (
                  <p className="tk-empty tk-empty-small">Free</p>
                ) : (
                  <ul>
                    {due.map((t) => (
                      <li key={t.id}>{String(t.title)}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </Panel>
    </>
  );
}
