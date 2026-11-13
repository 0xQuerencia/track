"use client";

import { useActionState } from "react";
import { createRowAction, type ActionState } from "@/app/actions";
import { ActionNotice } from "@/components/motion/action-notice";
import type { Field } from "@/lib/entities";

function FieldInput({
  field,
  defaultValue,
}: {
  field: Field;
  defaultValue?: string | number;
}) {
  const shared = {
    name: field.name,
    required: field.required,
    defaultValue,
  };
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
      return (
        <input {...shared} type="url" placeholder="https://" maxLength={2000} />
      );
    case "select":
      return (
        <select {...shared}>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case "boolean":
      return <input name={field.name} type="checkbox" />;
    default:
      return <input {...shared} type="text" maxLength={2000} />;
  }
}

export function EntityForm({
  entityKey,
  fields,
  defaults,
  submitLabel,
}: {
  entityKey: string;
  fields: readonly Field[];
  /** Server-resolved defaults (e.g. today's date) keyed by field name. */
  defaults: Record<string, string | number>;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createRowAction.bind(null, entityKey),
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
            <FieldInput field={field} defaultValue={defaults[field.name]} />
          </label>
        ))}
      </div>
      <div className="tk-form-actions">
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
        {state ? (
          <ActionNotice
            tone={state.ok ? "info" : "error"}
            role={state.ok ? "status" : "alert"}
          >
            {state.message}
          </ActionNotice>
        ) : null}
      </div>
    </form>
  );
}
