import { EntityPanel } from "@/components/track/entity-panel";
import { Page, Panel, StatGrid } from "@/components/track/page";
import { HabitsPanel, TaskBoard } from "@/components/track/plans-parts";
import { StatCard } from "@/components/track/stat-card";
import { listRows } from "@/lib/crud";
import { addDays, lastDays, shortDay, todayStr } from "@/lib/dates";
import { habitsToday, taskCounts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function PlansPage() {
  const tasks = listRows("tasks");
  const counts = taskCounts();
  const habits = habitsToday();
  const goals = listRows("goals");
  const nextWeek = lastDays(7, addDays(todayStr(), 6));

  return (
    <Page
      kicker="Plans"
      title="Plans"
      lede="Tasks, habits, goals, and what the coming week looks like."
    >
      <StatGrid>
        <StatCard label="Open tasks" value={counts.open} />
        <StatCard label="Due today" value={counts.dueToday} />
        <StatCard label="Overdue" value={counts.overdue} tone={counts.overdue > 0 ? "negative" : undefined} />
        <StatCard label="Habits today" value={habits.done} hint={`of ${habits.total}`} />
      </StatGrid>
      <TaskBoard tasks={tasks} />
      <HabitsPanel />
      <Panel title="This week" description="Open tasks by due date, today and the next six days.">
        <ol className="tk-week">
          {nextWeek.map((date) => {
            const due = tasks.filter((t) => t.status !== "Done" && t.due === date);
            return (
              <li key={date} data-today={date === todayStr() || undefined}>
                <h3>{date === todayStr() ? "Today" : shortDay(date)}</h3>
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
      <EntityPanel
        entityKey="goals"
        title="Long-term goals"
        rows={goals}
        columns={[
          { name: "title" },
          { name: "area" },
          { name: "target_date" },
          { name: "status", inline: true },
          { name: "notes" },
        ]}
      />
    </Page>
  );
}
