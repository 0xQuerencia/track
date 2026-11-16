"use client";

import { useActionState, useState, useTransition } from "react";
import { createTaskAction, deleteTaskAction, moveTaskAction, type ActionState } from "../actions";
import { TASK_KINDS, TASK_PRIORITIES, TASK_STATUSES, type TaskStatus } from "@/lib/projects/constants";
import type { TaskRecord } from "@/lib/projects/tasks";
import { formatWhen } from "@/lib/projects/format";
import { Field, StatusLine } from "./fields";
import { FormSubmit } from "./form-submit";

const COLUMN_LABEL: Record<TaskStatus, string> = { Backlog: "Backlog", Doing: "Doing", Done: "Done" };

function TaskCard({ task, projectId }: { task: TaskRecord; projectId: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const others = TASK_STATUSES.filter((status) => status !== task.status);

  const move = (status: TaskStatus) =>
    startTransition(async () => {
      const result = await moveTaskAction(task.id, projectId, status);
      setError(result?.ok ? null : result?.message ?? "Could not move the item.");
    });
  const remove = () =>
    startTransition(async () => {
      if (!window.confirm(`Delete “${task.title}”?`)) return;
      await deleteTaskAction(task.id, projectId);
    });

  return (
    <li className="pj-task" data-status={task.status} aria-busy={pending || undefined}>
      <div className="pj-task-head">
        <span className="pj-tag">{task.kind ?? "Task"}</span>
        {task.priority ? <span className="pj-tag" data-priority={task.priority}>{task.priority}</span> : null}
      </div>
      <p className="pj-task-title">{task.title}</p>
      {task.description ? <p className="pj-task-body">{task.description}</p> : null}
      <p className="pj-task-meta">{task.due_date ? `Due ${formatWhen(task.due_date)}` : "No due date"}</p>
      <div className="pj-task-actions">
        {others.map((status) => (
          <button key={status} type="button" className="tk-button tk-ghost" disabled={pending} onClick={() => move(status)}>
            To {COLUMN_LABEL[status]}
          </button>
        ))}
        <button type="button" className="tk-button tk-ghost tk-danger" disabled={pending} onClick={remove}>
          Delete
        </button>
      </div>
      {error ? <p className="pj-status" role="alert" data-tone="error">{error}</p> : null}
    </li>
  );
}

export function TaskBoard({ projectId, tasks }: { projectId: number; tasks: TaskRecord[] }) {
  const boundCreate = (previous: ActionState, formData: FormData) =>
    createTaskAction(projectId, previous, formData);
  const [state, action] = useActionState<ActionState, FormData>(boundCreate, null);

  return (
    <div className="pj-tasks">
      <details className="tk-add" open={tasks.length === 0}>
        <summary>Add backlog item</summary>
        <form action={action} className="tk-form" aria-label="Add backlog item">
          <div className="tk-form-grid">
            <Field label="Item" wide>
              <input name="title" required maxLength={200} />
            </Field>
            <Field label="Kind">
              <select name="kind" defaultValue="Feature">
                {TASK_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select name="priority" defaultValue="Medium">
                {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Column">
              <select name="status" defaultValue="Backlog">
                {TASK_STATUSES.map((s) => <option key={s} value={s}>{COLUMN_LABEL[s]}</option>)}
              </select>
            </Field>
            <Field label="Due">
              <input name="due_date" type="date" />
            </Field>
            <Field label="Details" wide>
              <textarea name="description" rows={2} maxLength={2000} />
            </Field>
          </div>
          <div className="tk-form-actions">
            <FormSubmit label="Add item" />
          </div>
          <StatusLine state={state} />
        </form>
      </details>

      <div className="pj-board" role="list" aria-label="Backlog by status">
        {TASK_STATUSES.map((status) => {
          const column = tasks.filter((task) => task.status === status);
          return (
            <section key={status} className="pj-column" aria-label={COLUMN_LABEL[status]}>
              <header className="pj-column-head">
                <h3>{COLUMN_LABEL[status]}</h3>
                <span className="tk-count">{column.length}</span>
              </header>
              {column.length === 0 ? (
                <p className="tk-empty-small">Nothing here.</p>
              ) : (
                <ul className="pj-task-list">
                  {column.map((task) => (
                    <TaskCard key={task.id} task={task} projectId={projectId} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
