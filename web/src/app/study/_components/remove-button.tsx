"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "@/app/actions";

/** Two-step remove for study rows: the first press asks, the second confirms. */
export function RemoveButton({
  id,
  label,
  remove,
}: {
  id: number;
  label: string;
  remove: (id: number) => Promise<ActionState>;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="tk-button tk-ghost tk-danger"
      disabled={pending}
      aria-label={armed ? `Confirm remove ${label}` : `Remove ${label}`}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          window.setTimeout(() => setArmed(false), 3000);
          return;
        }
        startTransition(() => {
          void remove(id);
        });
      }}
    >
      {armed ? "Sure?" : "Remove"}
    </button>
  );
}
