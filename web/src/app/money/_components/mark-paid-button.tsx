"use client";

import { useState, useTransition } from "react";
import { markRecurringPaidAction } from "../actions";

/** Records the payment for the item's current due date, once. */
export function MarkPaidButton({
  recurringId,
  dueDate,
  disabled = false,
}: {
  recurringId: number;
  dueDate: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <span className="money-mark-paid">
      <button
        type="button"
        className="tk-button tk-ghost"
        disabled={pending || disabled}
        onClick={() =>
          startTransition(async () => {
            const result = await markRecurringPaidAction(recurringId, dueDate);
            setMessage(result?.message ?? "Could not mark paid. Try again.");
          })
        }
      >
        {pending ? "Saving…" : "Mark paid"}
      </button>
      {message ? (
        <small role="status" className="money-mark-paid-note">
          {message}
        </small>
      ) : null}
    </span>
  );
}
