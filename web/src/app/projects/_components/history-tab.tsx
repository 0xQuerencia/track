import type { HistoryRecord } from "@/lib/projects/detail";
import { formatWhen } from "@/lib/projects/format";

const LABEL: Record<string, string> = {
  created: "Created",
  status: "Status changed",
  archived: "Archived",
  unarchived: "Restored",
  milestone: "Milestone done",
};

/** Timeline of real events only: created, status changes, archive and restore, and completed milestones. */
export function HistoryTab({ entries }: { entries: HistoryRecord[] }) {
  if (entries.length === 0)
    return (
      <p className="tk-empty">
        No history yet. Status changes, archiving and completed milestones are recorded here as they happen.
      </p>
    );
  return (
    <ol className="pj-timeline" aria-label="Project history">
      {entries.map((entry) => (
        <li key={entry.id} className="pj-timeline-item" data-kind={entry.kind}>
          <time className="pj-muted" dateTime={entry.at}>{formatWhen(entry.at)}</time>
          <p>
            <strong>{LABEL[entry.kind] ?? entry.kind}</strong>
            {entry.detail ? <span> · {entry.detail}</span> : null}
          </p>
        </li>
      ))}
    </ol>
  );
}
