"use client";

import { useState, useTransition } from "react";
import { setOverrideAction, removeOverrideAction } from "../actions";
import type { OverrideAction } from "@/lib/study/options";

const LABELS: Record<OverrideAction, string> = {
  pin: "Pin",
  snooze: "Snooze",
  skip: "Skip",
};

/** Pin, snooze or skip one chapter in the plan. The server picks the end date. */
export function OverrideButtons({ chapterId, name }: { chapterId: number; name: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span className="st-actions" role="group" aria-label={`Plan actions for ${name}`}>
      {(Object.keys(LABELS) as OverrideAction[]).map((action) => (
        <button
          key={action}
          type="button"
          className="tk-button tk-ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setOverrideAction(chapterId, action);
              setMessage(result && !result.ok ? result.message : null);
            })
          }
        >
          {LABELS[action]}
          <span className="tk-sr-only"> {name}</span>
        </button>
      ))}
      {message ? <span role="alert" className="st-inline-error">{message}</span> : null}
    </span>
  );
}

/** Removes an override that is still in force. */
export function ClearOverrideButton({ id, name }: { id: number; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="tk-button tk-ghost"
      disabled={pending}
      aria-label={`Clear plan override for ${name}`}
      onClick={() => startTransition(() => {
        void removeOverrideAction(id);
      })}
    >
      Clear
    </button>
  );
}
