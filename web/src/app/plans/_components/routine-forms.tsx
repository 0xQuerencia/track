"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addRoutineItemAction,
  applyRoutineTodayAction,
  createRoutineAction,
  deleteRoutineAction,
  deleteRoutineItemAction,
  type ActionState,
} from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";
import { WEEKDAYS } from "@/lib/plans/constants";

export function CreateRoutineForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createRoutineAction, null);
  return (
    <form action={action} className="tk-form">
      <div className="tk-form-grid">
        <label className="tk-field">
          <span>Routine</span>
          <input name="name" required maxLength={120} placeholder="Morning start" />
        </label>
        <label className="tk-field" data-wide="true">
          <span>Description</span>
          <textarea name="description" rows={2} maxLength={2000} />
        </label>
      </div>
      <div className="tk-form-actions">
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Saving…" : "Create routine"}
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

export function RoutineItemForm({ routineId }: { routineId: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addRoutineItemAction, null);
  return (
    <form action={action} className="tk-form pl-routine-item-form">
      <input type="hidden" name="routineId" value={routineId} />
      <div className="tk-form-grid">
        <label className="tk-field">
          <span>Item</span>
          <input name="title" required maxLength={200} />
        </label>
        <label className="tk-field">
          <span>Time</span>
          <input name="time" type="time" />
        </label>
        <fieldset className="pl-days" data-wide="true">
          <legend>Days (none checked means every day)</legend>
          {WEEKDAYS.map((day) => (
            <label key={day} className="pl-check">
              <input type="checkbox" name="days" value={day} />
              <span>{day}</span>
            </label>
          ))}
        </fieldset>
      </div>
      <div className="tk-form-actions">
        <button type="submit" className="tk-button" disabled={pending}>
          {pending ? "Adding…" : "Add item"}
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

/** Creates today's tasks from this routine. Pressing it again adds nothing new. */
export function ApplyRoutineButton({ routineId, disabled }: { routineId: number; disabled: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="pl-apply">
      <button
        type="button"
        className="tk-button tk-primary"
        disabled={pending || disabled}
        onClick={() =>
          startTransition(async () => {
            const result = await applyRoutineTodayAction(routineId);
            setMessage(result?.message ?? null);
          })
        }
      >
        {pending ? "Applying…" : "Apply to today"}
      </button>
      {message ? (
        <span className="pl-inline-status" role="status">
          {message}
        </span>
      ) : null}
    </span>
  );
}

/** Two-step delete for a routine or one of its items. */
export function RemoveButton({
  label,
  kind,
  id,
}: {
  label: string;
  kind: "routine" | "item";
  id: number;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="tk-button tk-ghost tk-danger"
      disabled={pending}
      aria-label={armed ? `Confirm remove ${label}` : `Remove ${label}`}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          window.setTimeout(() => setArmed(false), 3000);
          return;
        }
        startTransition(async () => {
          if (kind === "routine") await deleteRoutineAction(id);
          else await deleteRoutineItemAction(id);
        });
      }}
    >
      {armed ? "Sure?" : "Remove"}
    </button>
  );
}
