"use client";

import { useActionState, useRef } from "react";
import { addGoalReviewAction, createGoalAction, type ActionState } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";
import { GOAL_KINDS, GOAL_STATUSES, REVIEW_CADENCES, TASK_AREAS } from "@/lib/plans/constants";

/** Adds a goal. With `parentId` it becomes a sub-goal of that goal. */
export function GoalForm({ parentId, submitLabel }: { parentId: number | null; submitLabel: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createGoalAction, null);
  return (
    <form action={action} className="tk-form">
      {parentId !== null ? <input type="hidden" name="parent_id" value={parentId} /> : null}
      <div className="tk-form-grid">
        <label className="tk-field">
          <span>Goal</span>
          <input name="title" required maxLength={200} />
        </label>
        <label className="tk-field">
          <span>Kind</span>
          <select name="kind" defaultValue="Long-term">
            {GOAL_KINDS.map((value) => (
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
          <span>Status</span>
          <select name="status" defaultValue="Active">
            {GOAL_STATUSES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="tk-field">
          <span>Start</span>
          <input name="start_date" type="date" />
        </label>
        <label className="tk-field">
          <span>Target date</span>
          <input name="target_date" type="date" />
        </label>
        <label className="tk-field">
          <span>Review</span>
          <select name="review_cadence" defaultValue="None">
            {REVIEW_CADENCES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="tk-field" data-wide="true">
          <span>Notes</span>
          <textarea name="notes" rows={2} maxLength={2000} />
        </label>
      </div>
      <div className="tk-form-actions">
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
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

/** Records a review in a native dialog, so focus and Escape behave as expected. */
export function ReviewDialog({ goalId, title }: { goalId: number; title: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(addGoalReviewAction, null);
  return (
    <>
      <button
        type="button"
        className="tk-button"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        Review
      </button>
      <dialog ref={dialogRef} className="pl-dialog" aria-label={`Review ${title}`}>
        <form action={action} className="tk-form" method="dialog">
          <h3>Review: {title}</h3>
          <input type="hidden" name="goalId" value={goalId} />
          <div className="tk-form-grid">
            <label className="tk-field">
              <span>Date</span>
              <input name="date" type="date" required />
            </label>
            <label className="tk-field">
              <span>How it is going (1-5)</span>
              <select name="rating" defaultValue="">
                <option value="">No rating</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="tk-field" data-wide="true">
              <span>What changed, what is next</span>
              <textarea name="notes" rows={3} maxLength={2000} />
            </label>
          </div>
          <div className="tk-form-actions">
            <button type="submit" className="tk-button tk-primary" disabled={pending}>
              {pending ? "Saving…" : "Save review"}
            </button>
            <button type="button" className="tk-button tk-ghost" onClick={() => dialogRef.current?.close()}>
              Close
            </button>
            {state ? (
              <ActionNotice tone={state.ok ? "info" : "error"} role={state.ok ? "status" : "alert"}>
                {state.message}
              </ActionNotice>
            ) : null}
          </div>
        </form>
      </dialog>
    </>
  );
}
