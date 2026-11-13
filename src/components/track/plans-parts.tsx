import { shortDay, todayStr } from "@/lib/dates";
import type { Row } from "@/lib/crud";
import { getEntity } from "@/lib/entities";
import { habitGrid } from "@/lib/queries";
import { EntityForm } from "./entity-form";
import { HabitCell } from "./habit-grid";
import { DeleteButton, InlineField } from "./row-controls";

const weekday = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en", {
    weekday: "short",
    timeZone: "UTC",
  });

export function HabitsPanel() {
  const grid = habitGrid(7);
  const habit = getEntity("habits");
  if (!habit) return null;
  return (
    <section className="tk-panel" aria-label="Habits">
      <header className="tk-panel-head">
        <div>
          <h2>Habits</h2>
          <p>Tap a day to mark it done. The last seven days are shown.</p>
        </div>
        <span className="tk-count">{grid.habits.length}</span>
      </header>
      <details className="tk-add" open={grid.habits.length === 0}>
        <summary>Add habit</summary>
        <EntityForm
          entityKey="habits"
          fields={habit.fields}
          defaults={{}}
          submitLabel="Add habit"
        />
      </details>
      {grid.habits.length === 0 ? (
        <p className="tk-empty">No habits yet. Add one to start a streak.</p>
      ) : (
        <div className="tk-table-wrap">
          <table className="tk-table tk-habits">
            <thead>
              <tr>
                <th scope="col">Habit</th>
                {grid.dates.map((date) => (
                  <th key={date} scope="col" data-align="center" title={shortDay(date)}>
                    {weekday(date)}
                  </th>
                ))}
                <th scope="col" data-align="end">
                  Week
                </th>
                <th scope="col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {grid.habits.map((row) => {
                const count = grid.dates.filter((d) => grid.isDone(row.id, d)).length;
                return (
                  <tr key={row.id}>
                    <td>{String(row.name)}</td>
                    {grid.dates.map((date) => (
                      <td key={date} data-align="center">
                        <HabitCell
                          habitId={row.id}
                          date={date}
                          initial={grid.isDone(row.id, date)}
                          label={`${String(row.name)} on ${shortDay(date)}`}
                        />
                      </td>
                    ))}
                    <td data-align="end" className="tk-mono">
                      {count}/7
                    </td>
                    <td data-align="end">
                      <DeleteButton entityKey="habits" id={row.id} label={String(row.name)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const COLUMNS = ["To do", "Doing", "Done"] as const;

export function TaskBoard({ tasks }: { tasks: Row[] }) {
  const task = getEntity("tasks");
  if (!task) return null;
  const statusField = task.fields.find((f) => f.name === "status");
  const today = todayStr();
  const defaults: Record<string, string | number> = { priority: "Medium", status: "To do" };

  return (
    <section className="tk-panel" aria-label="Task board">
      <header className="tk-panel-head">
        <div>
          <h2>Task board</h2>
          <p>Change a task&rsquo;s status from its card.</p>
        </div>
        <span className="tk-count">{tasks.filter((t) => t.status !== "Done").length} open</span>
      </header>
      <details className="tk-add" open={tasks.length === 0}>
        <summary>Add task</summary>
        <EntityForm
          entityKey="tasks"
          fields={task.fields}
          defaults={defaults}
          submitLabel="Add task"
        />
      </details>
      <div className="tk-board-columns">
        {COLUMNS.map((column) => {
          const items = tasks
            .filter((t) => t.status === column)
            .slice(0, column === "Done" ? 8 : 40);
          return (
            <div key={column} className="tk-column" data-status={column}>
              <h3>
                {column} <span className="tk-count">{items.length}</span>
              </h3>
              {items.length === 0 ? (
                <p className="tk-empty tk-empty-small">Nothing here.</p>
              ) : (
                <ul>
                  {items.map((t) => {
                    const overdue = t.due && t.status !== "Done" && String(t.due) < today;
                    return (
                      <li key={t.id} className="tk-card">
                        <p className="tk-card-title">{String(t.title)}</p>
                        <p className="tk-card-meta">
                          <span data-priority={String(t.priority)}>{String(t.priority)}</span>
                          <span>{String(t.area ?? "")}</span>
                          {t.due ? (
                            <span data-overdue={overdue || undefined}>
                              Due {shortDay(String(t.due))}
                            </span>
                          ) : null}
                        </p>
                        <div className="tk-card-actions">
                          {statusField ? (
                            <InlineField
                              entityKey="tasks"
                              id={t.id}
                              field={statusField}
                              value={String(t.status)}
                            />
                          ) : null}
                          <DeleteButton entityKey="tasks" id={t.id} label={String(t.title)} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
