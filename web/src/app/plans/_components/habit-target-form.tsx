"use client";

import { useActionState } from "react";
import { setHabitTargetAction, type ActionState } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";

/** Sets how many days a week a habit should be done. */
export function HabitTargetForm({
  habitId,
  habitName,
  current,
}: {
  habitId: number;
  habitName: string;
  current: number | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setHabitTargetAction, null);
  return (
    <form action={action} className="pl-inline-form">
      <input type="hidden" name="habitId" value={habitId} />
      <label className="tk-field">
        <span className="tk-sr-only">Weekly target for {habitName}</span>
        <select name="perWeek" defaultValue={current === null ? "0" : String(current)} className="tk-inline">
          <option value="0">No target</option>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "day" : "days"} a week
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="tk-button" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
      {state ? (
        <ActionNotice tone={state.ok ? "info" : "error"} role={state.ok ? "status" : "alert"}>
          {state.message}
        </ActionNotice>
      ) : null}
    </form>
  );
}
