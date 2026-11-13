"use client";

import { useState, useTransition } from "react";
import { deleteRowAction, setFieldAction } from "@/app/actions";
import type { Field } from "@/lib/entities";

/** Edits one field of an existing row in place and saves it on change. */
export function InlineField({
  entityKey,
  id,
  field,
  value,
}: {
  entityKey: string;
  id: number;
  field: Field;
  value: string | number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [invalid, setInvalid] = useState(false);

  const save = (raw: string) => {
    startTransition(async () => {
      const result = await setFieldAction(entityKey, id, field.name, raw);
      setInvalid(!result?.ok);
    });
  };

  const common = {
    "aria-label": `${field.label} for row ${id}`,
    "aria-invalid": invalid || undefined,
    disabled: pending,
    className: "tk-inline",
  } as const;

  if (field.type === "boolean")
    return (
      <input
        {...common}
        type="checkbox"
        defaultChecked={value === 1}
        onChange={(event) => save(event.target.checked ? "1" : "0")}
      />
    );
  if (field.type === "select")
    return (
      <select
        {...common}
        defaultValue={String(value ?? "")}
        onChange={(event) => save(event.target.value)}
      >
        {field.options?.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  return (
    <input
      {...common}
      type="number"
      inputMode="decimal"
      min={field.min}
      max={field.max}
      step={field.step ?? "any"}
      defaultValue={value ?? ""}
      onBlur={(event) => {
        if (event.target.value !== String(value ?? "")) save(event.target.value);
      }}
    />
  );
}

/** Two-step delete: the first press asks, the second confirms. */
export function DeleteButton({
  entityKey,
  id,
  label,
}: {
  entityKey: string;
  id: number;
  label: string;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="tk-button tk-ghost tk-danger"
      disabled={pending}
      aria-label={armed ? `Confirm delete ${label}` : `Delete ${label}`}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          window.setTimeout(() => setArmed(false), 3000);
          return;
        }
        startTransition(() => deleteRowAction(entityKey, id));
      }}
    >
      {armed ? "Sure?" : "Delete"}
    </button>
  );
}
