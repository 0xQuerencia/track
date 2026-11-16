"use client";

import { useActionState, useId } from "react";
import { ActionNotice } from "@/components/motion/action-notice";
import { saveNotesAction, type SessionActionState } from "../actions";

/** Plain-text notes for one session. Shown as text, never as HTML. */
export function NotesEditor({ sessionId, notes }: { sessionId: number; notes: string | null }) {
  const [state, action, pending] = useActionState<SessionActionState, FormData>(saveNotesAction, null);
  const fieldId = useId();
  return (
    <form action={action} className="ses-form">
      <input type="hidden" name="id" value={sessionId} />
      <label className="tk-field" htmlFor={fieldId}>
        <span>Your notes (plain text, up to 10,000 characters)</span>
        <textarea
          id={fieldId}
          name="notes"
          rows={6}
          maxLength={10_000}
          defaultValue={notes ?? ""}
          disabled={pending}
        />
      </label>
      <button type="submit" className="tk-button" disabled={pending}>
        Save notes
      </button>
      {state ? (
        <ActionNotice tone={state.ok ? "info" : "error"} role={state.ok ? "status" : "alert"}>
          {state.message}
        </ActionNotice>
      ) : null}
    </form>
  );
}
