"use client";

import { useActionState } from "react";
import { saveWeeklyPlanAction, type ActionState } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";

export function WeeklyPlanForm({
  weekStart,
  intentions,
  top3,
  reflection,
}: {
  weekStart: string;
  intentions: string;
  top3: string;
  reflection: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveWeeklyPlanAction, null);
  return (
    <form action={action} className="tk-form">
      <input type="hidden" name="weekStart" value={weekStart} />
      <div className="tk-form-grid">
        <label className="tk-field" data-wide="true">
          <span>Intentions for the week</span>
          <textarea name="intentions" rows={3} maxLength={4000} defaultValue={intentions} />
        </label>
        <label className="tk-field" data-wide="true">
          <span>Top three (one per line)</span>
          <textarea name="top3" rows={3} maxLength={1000} defaultValue={top3} />
        </label>
        <label className="tk-field" data-wide="true">
          <span>Review</span>
          <textarea name="reflection" rows={6} maxLength={4000} defaultValue={reflection} />
        </label>
      </div>
      <div className="tk-form-actions">
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Saving…" : "Save week"}
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
