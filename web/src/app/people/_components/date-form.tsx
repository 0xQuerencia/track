"use client";

import { useActionState, useEffect, useRef } from "react";
import type { PeopleActionState } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";
import { IMPORTANT_DATE_KINDS } from "@/lib/people/constants";

export type DateDefaults = {
  title?: string;
  date?: string;
  person_id?: number | null;
  kind?: string;
  repeat_yearly?: boolean;
  remind_days_before?: number | null;
};

type Action = (previous: PeopleActionState, formData: FormData) => Promise<PeopleActionState>;

/** Create and edit form for an important date. */
export function ImportantDateForm({
  action,
  defaults = {},
  people,
  submitLabel,
  resetOnSuccess = false,
}: {
  action: Action;
  defaults?: DateDefaults;
  people: { id: number; name: string }[];
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
        <label className="people-field" data-wide>
          <span>Title</span>
          <input name="title" required maxLength={2000} defaultValue={defaults.title ?? ""} />
        </label>
        <label className="people-field">
          <span>Date</span>
          <input name="date" type="date" required defaultValue={defaults.date ?? ""} />
        </label>
        <label className="people-field">
          <span>Kind</span>
          <select name="kind" defaultValue={defaults.kind ?? "Other"}>
            {IMPORTANT_DATE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label className="people-field">
          <span>Person</span>
          <select name="person_id" defaultValue={defaults.person_id ?? ""}>
            <option value="">No one in particular</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label className="people-field">
          <span>Remind days before</span>
          <input
            name="remind_days_before"
            type="number"
            min={0}
            max={365}
            step={1}
            defaultValue={defaults.remind_days_before ?? ""}
          />
        </label>
        <label className="people-check">
          <input name="repeat_yearly" type="checkbox" defaultChecked={defaults.repeat_yearly ?? false} />
          <span>Repeats every year</span>
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
