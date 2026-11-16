"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { logRevisionAction } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";
import type { ActionState } from "@/app/actions";

export type LogChapter = { id: number; label: string };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="tk-button tk-primary" disabled={pending}>
      {pending ? "Saving…" : "Log revision"}
    </button>
  );
}

/**
 * Records one revision. Mastery changes only when the user types a value here;
 * nothing is inferred from minutes studied.
 */
export function RevisionLogForm({
  chapters,
  fixedChapterId,
  today,
}: {
  chapters: LogChapter[];
  fixedChapterId?: number;
  today: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(logRevisionAction, null);
  return (
    <form action={action} className="tk-form st-log-form">
      <div className="tk-form-grid">
        {fixedChapterId !== undefined ? (
          <input type="hidden" name="chapter_id" value={fixedChapterId} />
        ) : (
          <label className="tk-field">
            <span>Chapter</span>
            <select name="chapter_id" required defaultValue="">
              <option value="" disabled>
                Choose a chapter
              </option>
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="tk-field">
          <span>Date</span>
          <input type="date" name="date" required defaultValue={today} max={today} />
        </label>
        <label className="tk-field">
          <span>Minutes</span>
          <input type="number" name="minutes" min={0} max={1440} inputMode="numeric" />
        </label>
        <label className="tk-field">
          <span>Confidence (1-5)</span>
          <select name="confidence" defaultValue="">
            <option value="">Not rated</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="tk-field">
          <span>Mastery after, % (optional)</span>
          <input type="number" name="mastery_after" min={0} max={100} inputMode="numeric" />
        </label>
        <label className="tk-field" data-wide="true">
          <span>Notes</span>
          <input type="text" name="notes" maxLength={500} />
        </label>
      </div>
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
