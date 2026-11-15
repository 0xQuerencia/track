"use client";

import { useEffect, useRef, useState, useTransition } from "react";

const ARM_MS = 3000;

/**
 * Two-step destructive button for pages whose delete is a custom server
 * action, not the generic row delete. The first press arms it, the second runs
 * the action. The action may redirect away after it succeeds.
 */
export function ConfirmActionButton({
  label,
  action,
  className = "tk-button tk-ghost tk-danger",
}: {
  /** What is being deleted, for the accessible name. */
  label: string;
  action: () => Promise<unknown>;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      aria-label={armed ? `Confirm delete ${label}` : `Delete ${label}`}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          timer.current = window.setTimeout(() => setArmed(false), ARM_MS);
          return;
        }
        window.clearTimeout(timer.current);
        startTransition(async () => {
          await action();
        });
      }}
    >
      {armed ? "Sure?" : "Delete"}
    </button>
  );
}
