"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setIdeaStatusAction } from "../actions";
import { IDEA_STATUSES } from "@/lib/entities-ext/ideas-knowledge";

/** Changes an idea's status from a card or a board column. Keyboard friendly: a native select. */
export function StatusSelect({ id, title, value }: { id: number; title: string; value: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="id-status-select">
      <span className="tk-sr-only">Status of {title}</span>
      <select
        value={value}
        disabled={pending}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(async () => {
            const result = await setIdeaStatusAction(id, next);
            setError(result?.ok ? null : result?.message ?? "Could not change the status.");
            router.refresh();
          });
        }}
      >
        {IDEA_STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      {error ? <small role="alert">{error}</small> : null}
    </label>
  );
}
