"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addPrereqAction } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";
import type { ActionState } from "@/app/actions";

export type PrereqChoice = { id: number; label: string };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="tk-button tk-primary" disabled={pending}>
      {pending ? "Adding…" : "Add prerequisite"}
    </button>
  );
}

/** Adds a prerequisite for one chapter. Choices already filtered on the server to avoid loops. */
export function PrereqForm({
  chapterId,
  choices,
}: {
  chapterId: number;
  choices: PrereqChoice[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(addPrereqAction, null);
  if (choices.length === 0)
    return <p className="tk-empty-small">No other chapter can be added without making a loop.</p>;
  return (
    <form action={action} className="st-prereq-form">
      <input type="hidden" name="chapter_id" value={chapterId} />
      <label className="tk-field">
        <span>Needs this chapter first</span>
        <select name="prereq_id" required defaultValue="">
          <option value="" disabled>
            Choose a chapter
          </option>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      <div className="tk-form-actions">
        <Submit />
        {state ? (
          <ActionNotice tone={state.ok ? "info" : "error"} role={state.ok ? "status" : "alert"}>
            {state.message}
          </ActionNotice>
        ) : null}
      </div>
    </form>
  );
}
