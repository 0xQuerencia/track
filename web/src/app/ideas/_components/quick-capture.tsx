"use client";

import { useActionState } from "react";
import { captureIdeaAction, type ActionState } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";

/** One field, one Enter key: the idea lands in the Inbox. */
export function QuickCapture({ autoFocus }: { autoFocus: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(captureIdeaAction, null);
  return (
    <section className="tk-panel id-capture" aria-label="Quick capture">
      <form action={action} className="id-capture-form">
        <label className="tk-field id-capture-field">
          <span>Capture an idea to the Inbox</span>
          <input
            name="title"
            type="text"
            required
            maxLength={200}
            autoFocus={autoFocus}
            placeholder="One line is enough. Details can come later."
            autoComplete="off"
          />
        </label>
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Saving…" : "Capture"}
        </button>
      </form>
      {state ? (
        <ActionNotice tone={state.ok ? "info" : "error"} role={state.ok ? "status" : "alert"}>
          {state.message}
        </ActionNotice>
      ) : null}
    </section>
  );
}
