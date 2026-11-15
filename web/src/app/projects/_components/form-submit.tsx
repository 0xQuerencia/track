"use client";

import { useFormStatus } from "react-dom";

export function FormSubmit({
  label,
  pendingLabel = "Saving…",
  danger = false,
}: {
  label: string;
  pendingLabel?: string;
  danger?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`tk-button ${danger ? "tk-danger" : "tk-primary"}`} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
