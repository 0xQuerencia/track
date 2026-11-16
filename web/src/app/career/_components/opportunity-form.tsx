"use client";

import { useActionState, useEffect, useRef } from "react";
import type { CareerActionState } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";
import {
  OPPORTUNITY_KINDS,
  OPPORTUNITY_PRIORITIES,
  OPPORTUNITY_STATUSES,
} from "@/lib/career/constants";

export type OpportunityDefaults = {
  title?: string;
  org?: string | null;
  kind?: string;
  status?: string;
  deadline?: string | null;
  url?: string | null;
  notes?: string | null;
  priority?: string | null;
  achieved_on?: string | null;
};

type Action = (
  previous: CareerActionState,
  formData: FormData,
) => Promise<CareerActionState>;

/**
 * Create and edit form for an opportunity. The server action validates every
 * field; this form only shapes the input. On success a create form clears.
 */
export function OpportunityForm({
  action,
  defaults = {},
  submitLabel,
  resetOnSuccess = false,
}: {
  action: Action;
  defaults?: OpportunityDefaults;
  submitLabel: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState<CareerActionState, FormData>(
    action,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state?.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className="career-form">
      <div className="career-form-grid">
        <label className="career-field" data-wide>
          <span>Title</span>
          <input name="title" required maxLength={2000} defaultValue={defaults.title ?? ""} />
        </label>
        <label className="career-field">
          <span>Organisation</span>
          <input name="org" maxLength={2000} defaultValue={defaults.org ?? ""} />
        </label>
        <label className="career-field">
          <span>Kind</span>
          <select name="kind" defaultValue={defaults.kind ?? "Other"}>
            {OPPORTUNITY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label className="career-field">
          <span>Status</span>
          <select name="status" defaultValue={defaults.status ?? "Interested"}>
            {OPPORTUNITY_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="career-field">
          <span>Priority</span>
          <select name="priority" defaultValue={defaults.priority ?? "Medium"}>
            {OPPORTUNITY_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>
        <label className="career-field">
          <span>Deadline</span>
          <input name="deadline" type="date" defaultValue={defaults.deadline ?? ""} />
        </label>
        <label className="career-field">
          <span>Achieved on</span>
          <input name="achieved_on" type="date" defaultValue={defaults.achieved_on ?? ""} />
        </label>
        <label className="career-field" data-wide>
          <span>Link</span>
          <input name="url" type="url" placeholder="https://" maxLength={2000} defaultValue={defaults.url ?? ""} />
        </label>
        <label className="career-field" data-wide>
          <span>Notes (Markdown)</span>
          <textarea name="notes" rows={4} maxLength={2000} defaultValue={defaults.notes ?? ""} />
        </label>
      </div>
      <div className="career-form-actions">
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
