"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setIdeaFlagAction } from "../actions";

/** Pin or archive toggle. The label states the action it will take. */
export function FlagButton({
  id,
  flag,
  value,
  onLabel,
  offLabel,
}: {
  id: number;
  flag: "pinned" | "archived";
  value: boolean;
  onLabel: string;
  offLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="tk-button tk-ghost"
      aria-pressed={value}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setIdeaFlagAction(id, flag, !value);
          router.refresh();
        })
      }
    >
      {value ? offLabel : onLabel}
    </button>
  );
}
