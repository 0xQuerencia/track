import { Check, Circle, Minus, X } from "lucide-react";
import { STATE_LABEL, type QState } from "@/lib/qv/constants";

const ICON = { red: X, yellow: Minus, green: Check, unassessed: Circle } as const;

/** Colour is never the only signal: every state also has an icon and its name. */
export function StateBadge({ state }: { state: QState }) {
  const Icon = ICON[state];
  return (
    <span className="qv-badge" data-state={state}>
      <Icon size={12} aria-hidden="true" />
      {STATE_LABEL[state]}
    </span>
  );
}

export const ratingIcon = ICON;

export function when(date: string | null, today: string): string {
  if (!date) return "Not scheduled";
  if (date < today) {
    const days = Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
    return `${days} d overdue`;
  }
  if (date === today) return "Due today";
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
  return days === 1 ? "Tomorrow" : `In ${days} d`;
}

export type ChapterChoice = { id: number; label: string; subject: string };
