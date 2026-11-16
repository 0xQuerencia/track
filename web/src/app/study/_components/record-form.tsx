"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createStudyRecordAction } from "../actions";
import { ActionNotice } from "@/components/motion/action-notice";
import type { ActionState } from "@/app/actions";
import type { Field } from "@/lib/entities";

export type ChapterOption = { id: number; label: string };

function Input({
  field,
  defaultValue,
  chapters,
}: {
  field: Field;
  defaultValue?: string | number;
  chapters: ChapterOption[];
}) {
  const shared = { name: field.name, required: field.required, defaultValue };
  if (field.name === "chapter_id")
    return (
      <select {...shared} defaultValue={defaultValue ?? ""}>
        <option value="">No chapter</option>
        {chapters.map((chapter) => (
          <option key={chapter.id} value={chapter.id}>
            {chapter.label}
          </option>
        ))}
      </select>
    );
  switch (field.type) {
    case "textarea":
      return <textarea {...shared} rows={2} maxLength={2000} />;
    case "number":
      return (
        <input
          {...shared}
          type="number"
          inputMode="decimal"
          min={field.min}
          max={field.max}
          step={field.step ?? "any"}
        />
      );
    case "date":
      return <input {...shared} type="date" />;
    case "url":
      return <input {...shared} type="url" placeholder="https://" maxLength={2000} />;
    case "select":
      return (
        <select {...shared} defaultValue={defaultValue ?? field.options?.[0]}>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    default:
      return <input {...shared} type="text" maxLength={2000} />;
  }
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="tk-button tk-primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

/** Add form for a study record type. Uses the study action, which validates cross-field rules. */
export function RecordForm({
  entityKey,
  fields,
  defaults,
  chapters,
  submitLabel,
}: {
  entityKey: string;
  fields: readonly Field[];
  defaults: Record<string, string | number>;
  chapters: ChapterOption[];
  submitLabel: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    createStudyRecordAction.bind(null, entityKey),
    null,
  );
  return (
    <form action={action} className="tk-form">
      <div className="tk-form-grid">
        {fields.map((field) => (
          <label
            key={field.name}
            className="tk-field"
            data-type={field.type}
            data-wide={field.type === "textarea" || undefined}
          >
            <span>{field.label}</span>
            <Input field={field} defaultValue={defaults[field.name]} chapters={chapters} />
          </label>
        ))}
      </div>
      <div className="tk-form-actions">
        <Submit label={submitLabel} />
        {state ? (
          <ActionNotice tone={state.ok ? "info" : "error"} role={state.ok ? "status" : "alert"}>
            {state.message}
          </ActionNotice>
        ) : null}
      </div>
    </form>
  );
}
