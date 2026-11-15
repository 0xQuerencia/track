import { shortDay, todayStr } from "@/lib/dates";
import { listRows } from "@/lib/crud";
import { RECURRENCES } from "@/lib/plans/constants";
import { TaskForm } from "./task-form";
import { TaskControls } from "./task-controls";

const COLUMNS = ["To do", "Doing", "Done"] as const;

/** Task board: create a task, then move it between columns from its card. */
export function TasksTab({ openForm }: { openForm: boolean }) {
  const tasks = listRows("tasks");
  const today = todayStr();
  const open = tasks.filter((t) => t.status !== "Done").length;

  return (
    <section className="tk-panel" aria-label="Task board">
      <header className="tk-panel-head">
        <div>
          <h2>Task board</h2>
          <p>Change a task&rsquo;s status from its card. Repeating tasks schedule the next occurrence when finished.</p>
        </div>
        <span className="tk-count">{open} open</span>
      </header>
      <details className="tk-add" open={openForm || tasks.length === 0}>
        <summary>Add task</summary>
        <TaskForm autoFocus={openForm} />
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
                    const recurrence = String(t.recurrence ?? "None");
                    const repeats = (RECURRENCES as readonly string[]).includes(recurrence) && recurrence !== "None";
                    const overdue = t.due && t.status !== "Done" && String(t.due) < today;
                    return (
                      <li key={t.id} id={`tasks-${t.id}`} className="tk-card">
                        <p className="tk-card-title">{String(t.title)}</p>
                        <p className="tk-card-meta">
                          <span data-priority={String(t.priority)}>{String(t.priority)}</span>
                          <span>{String(t.area ?? "")}</span>
                          {t.due ? (
                            <span data-overdue={overdue || undefined}>Due {shortDay(String(t.due))}</span>
                          ) : null}
                          {repeats ? <span className="pl-repeat">Repeats {recurrence.toLowerCase()}</span> : null}
                        </p>
                        <TaskControls
                          id={t.id}
                          title={String(t.title)}
                          status={String(t.status)}
                          recurring={repeats}
                        />
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
