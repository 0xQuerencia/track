"use client";

import { useState, useTransition } from "react";
import { deleteJournalAction } from "../actions";

/** Two-step delete for one entry: the first press asks, the second confirms, then the list opens. */
export function JournalDeleteButton({ id }: { id: number }) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="tk-button tk-ghost tk-danger"
      disabled={pending}
      aria-label={armed ? "Confirm delete this entry" : "Delete this entry"}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          window.setTimeout(() => setArmed(false), 3000);
          return;
        }
        startTransition(() => deleteJournalAction(id));
      }}
    >
      {armed ? "Sure? This cannot be undone." : "Delete entry"}
    </button>
  );
}
