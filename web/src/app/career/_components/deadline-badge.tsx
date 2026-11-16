import type { DeadlineBadge } from "@/lib/career/deadlines";

/** Visual badge for a deadline. The tone is in data-tone so CSS owns the colours. */
export function DeadlineBadgeChip({ badge }: { badge: DeadlineBadge | null }) {
  if (!badge) return <span className="career-muted">No deadline</span>;
  return (
    <span className="career-badge" data-tone={badge.tone}>
      {badge.label}
    </span>
  );
}
