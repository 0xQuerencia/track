import type { HistoryRow } from "@/lib/career/queries";
import { shortDay } from "@/lib/dates";

/** Status changes in order, oldest first. The first entry is the status it was created with. */
export function HistoryTimeline({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) return <p className="tk-empty">No status changes recorded.</p>;
  return (
    <ol className="career-timeline" aria-label="Status history">
      {rows.map((row) => (
        <li key={row.id}>
          <time dateTime={row.at.replace(" ", "T") + "Z"}>
            {shortDay(row.at.slice(0, 10))}
          </time>
          <span>
            {row.from_status ? (
              <>
                {row.from_status} <span aria-hidden="true">→</span> {row.to_status}
              </>
            ) : (
              <>Created as {row.to_status}</>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
