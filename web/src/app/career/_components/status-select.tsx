"use client";

import { useState, useTransition } from "react";
import { setOpportunityStatusAction } from "../actions";
import { OPPORTUNITY_STATUSES } from "@/lib/career/constants";

/** Changes an opportunity's status in place. The history trigger records the change. */
export function StatusSelect({ id, status, label }: { id: number; status: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <select
        className="career-status"
        aria-label={`Status for ${label}`}
        value={status}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          setError(null);
          startTransition(async () => {
            const result = await setOpportunityStatusAction(id, next);
            if (result && !result.ok) setError(result.message);
          });
        }}
      >
        {OPPORTUNITY_STATUSES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error ? (
        <span className="career-inline-error" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
