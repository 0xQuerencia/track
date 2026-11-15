"use client";

import { useState, useTransition } from "react";
import { completeTaskAction, deleteTaskAction, setTaskStatusAction, type ActionState } from "../actions";
import { TASK_STATUSES } from "@/lib/plans/constants";

/**
 * Status, Complete and Delete for one task. Every status change goes through
 * the plans actions, so finishing a repeating task always schedules its next
 * occurrence.
 */
export function TaskControls({
  id,
  title,
  status,
  recurring,
}: {
  id: number;
  title: string;
  status: string;
  recurring: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<ActionState | void>) =>
    startTransition(async () => {
      const result = await work();
      setMessage(result ? result.message : null);
    });

  return (
    <div className="pl-task-controls">
      <div className="tk-card-actions">
        <select
          aria-label={`Status of ${title}`}
          className="tk-inline"
          value={status}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.value;
            run(() => setTaskStatusAction(id, next));
          }}
        >
          {TASK_STATUSES.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        {recurring && status !== "Done" ? (
          <button
            type="button"
            className="tk-button"
            disabled={pending}
            aria-label={`Complete ${title} and schedule the next one`}
            onClick={() => run(() => completeTaskAction(id))}
          >
            Complete
          </button>
        ) : null}
        <button
          type="button"
          className="tk-button tk-ghost tk-danger"
          disabled={pending}
          aria-label={armed ? `Confirm delete ${title}` : `Delete ${title}`}
          onClick={() => {
            if (!armed) {
              setArmed(true);
              window.setTimeout(() => setArmed(false), 3000);
              return;
            }
            run(() => deleteTaskAction(id));
          }}
        >
          {armed ? "Sure?" : "Delete"}
        </button>
      </div>
      {message ? (
        <p className="pl-inline-status" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
