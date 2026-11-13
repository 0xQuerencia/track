"use client";

import { useState, useTransition } from "react";
import { toggleHabitAction } from "@/app/actions";

/** One day's check for one habit. Flips at once and saves in the background. */
export function HabitCell({
  habitId,
  date,
  initial,
  label,
}: {
  habitId: number;
  date: string;
  initial: boolean;
  label: string;
}) {
  const [done, setDone] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="tk-habit-cell"
      aria-pressed={done}
      aria-label={label}
      disabled={pending}
      onClick={() => {
        setDone((v) => !v);
        startTransition(() => toggleHabitAction(habitId, date));
      }}
    />
  );
}
