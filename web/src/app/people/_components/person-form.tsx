"use client";

import { useActionState, useEffect, useRef } from "react";
import type { PeopleActionState } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";

export type PersonDefaults = {
  name?: string;
  relationship?: string | null;
  phone?: string | null;
  birthday?: string | null;
  last_contacted?: string | null;
  tags?: string | null;
  notes?: string | null;
};

type Action = (previous: PeopleActionState, formData: FormData) => Promise<PeopleActionState>;

/** Create and edit form for a person. Only the fields the vault needs; no contact details beyond phone. */
export function PersonForm({
  action,
  defaults = {},
  submitLabel,
  resetOnSuccess = false,
}: {
  action: Action;
  defaults?: PersonDefaults;
  submitLabel: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState<PeopleActionState, FormData>(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state?.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className="people-form">
      <div className="people-form-grid">
        <label className="people-field">
          <span>Name</span>
          <input name="name" required maxLength={2000} defaultValue={defaults.name ?? ""} />
        </label>
        <label className="people-field">
          <span>Relationship</span>
          <input name="relationship" maxLength={2000} placeholder="Friend, mentor, cousin…" defaultValue={defaults.relationship ?? ""} />
        </label>
        <label className="people-field">
          <span>Phone</span>
          <input name="phone" type="tel" maxLength={2000} defaultValue={defaults.phone ?? ""} />
        </label>
        <label className="people-field">
          <span>Birthday</span>
          <input
            name="birthday"
            maxLength={10}
            inputMode="numeric"
            placeholder="MM-DD or YYYY-MM-DD"
            pattern="(\d{2}-\d{2}|\d{4}-\d{2}-\d{2})"
            defaultValue={defaults.birthday ?? ""}
          />
        </label>
        <label className="people-field">
          <span>Last contacted</span>
          <input name="last_contacted" type="date" defaultValue={defaults.last_contacted ?? ""} />
        </label>
        <label className="people-field">
          <span>Tags</span>
          <input name="tags" maxLength={2000} placeholder="comma, separated" defaultValue={defaults.tags ?? ""} />
        </label>
        <label className="people-field" data-wide>
          <span>Notes</span>
          <textarea name="notes" rows={3} maxLength={2000} defaultValue={defaults.notes ?? ""} />
        </label>
      </div>
      <div className="people-form-actions">
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
