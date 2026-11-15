"use client";

import { useActionState } from "react";
import { createTaskAction, type ActionState } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";
import { RECURRENCES, TASK_AREAS, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/plans/constants";

/** New task form. `autoFocus` is set when the page was opened with ?new=task. */
export function TaskForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createTaskAction, null);
  return (
    <form action={action} className="tk-form">
      <div className="tk-form-grid">
        <label className="tk-field">
          <span>Task</span>
          <input name="title" required maxLength={200} autoFocus={autoFocus} />
        </label>
        <label className="tk-field">
          <span>Due</span>
          <input name="due" type="date" />
        </label>
        <label className="tk-field">
          <span>Priority</span>
          <select name="priority" defaultValue="Medium">
            {TASK_PRIORITIES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="tk-field">
          <span>Status</span>
          <select name="status" defaultValue="To do">
            {TASK_STATUSES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="tk-field">
          <span>Area</span>
          <select name="area" defaultValue="">
            <option value="">None</option>
            {TASK_AREAS.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="tk-field">
          <span>Repeats</span>
          <select name="recurrence" defaultValue="None">
            {RECURRENCES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="tk-field">
          <span>Repeat until</span>
          <input name="recurrence_until" type="date" />
        </label>
      </div>
      <div className="tk-form-actions">
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Saving…" : "Add task"}
        </button>
        {state ? (
          <ActionNotice tone={state.ok ? "info" : "error"} role={state.ok ? "status" : "alert"}>
            {state.message}
          </ActionNotice>
        ) : null}
      </div>
    </form>
  );
}
