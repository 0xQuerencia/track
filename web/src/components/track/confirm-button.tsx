"use client";

import { useEffect, useRef, useState, useTransition } from "react";

const ARM_MS = 3000;

/** Two-step button: the first press arms it, the second within three seconds confirms. */
export function ConfirmButton({
  label,
  confirmLabel = "Sure?",
  onConfirm,
  className = "tk-button tk-ghost tk-danger",
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
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
      aria-label={armed ? `Confirm: ${label}` : label}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setArmed(false), ARM_MS);
          return;
        }
        window.clearTimeout(timer.current);
        startTransition(async () => {
          await onConfirm();
          setArmed(false);
        });
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
