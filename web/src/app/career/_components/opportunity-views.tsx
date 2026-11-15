import Link from "next/link";
import { Markdown } from "@/components/track/markdown";
import { OPPORTUNITY_STATUSES } from "@/lib/career/constants";
import { deadlineBadge } from "@/lib/career/deadlines";
import type { OpportunityRow } from "@/lib/career/queries";
import { shortDay } from "@/lib/dates";
import { DeadlineBadgeChip } from "./deadline-badge";
import { StatusSelect } from "./status-select";

/* Server-rendered list and board views. Both take rows already filtered and sorted. */

export function OpportunityList({
  rows,
  today,
}: {
  rows: OpportunityRow[];
  today: string;
}) {
  return (
    <div className="tk-table-wrap">
      <table className="tk-table career-table">
        <thead>
          <tr>
            <th scope="col">Opportunity</th>
            <th scope="col">Kind</th>
            <th scope="col">Status</th>
            <th scope="col">Deadline</th>
            <th scope="col">Priority</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const badge = deadlineBadge(row.deadline, row.status, today);
            return (
              <tr key={row.id} id={`opportunities-${row.id}`}>
                <td>
                  <Link href={`/career/${row.id}`} className="career-title">
                    {row.title}
                  </Link>
                  {row.org ? <span className="career-muted">{row.org}</span> : null}
                </td>
                <td>{row.kind}</td>
                <td>
                  <StatusSelect id={row.id} status={row.status} label={row.title} />
                </td>
                <td>
                  <span className="career-deadline">
                    {row.deadline ? shortDay(row.deadline) : "—"}
                  </span>
                  <DeadlineBadgeChip badge={badge} />
                </td>
                <td>{row.priority ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function OpportunityBoard({
  rows,
  today,
  truncated,
}: {
  rows: OpportunityRow[];
  today: string;
  truncated: boolean;
}) {
  return (
    <div className="career-board">
      {truncated ? (
        <p className="tk-empty-small">Showing the first 300 matching opportunities. Narrow the filters to see the rest.</p>
      ) : null}
      <div className="career-columns">
        {OPPORTUNITY_STATUSES.map((status) => {
          const cards = rows.filter((row) => row.status === status);
          return (
            <section key={status} className="career-column" data-status={status} aria-label={status}>
              <h3>
                {status} <span className="tk-count">{cards.length}</span>
              </h3>
              {cards.length === 0 ? <p className="tk-empty-small">Nothing here.</p> : null}
              <ul>
                {cards.map((row) => {
                  const badge = deadlineBadge(row.deadline, row.status, today);
                  return (
                    <li key={row.id} className="career-card">
                      <Link href={`/career/${row.id}`} className="career-title">
                        {row.title}
                      </Link>
                      <span className="career-muted">
                        {[row.org, row.kind].filter(Boolean).join(" · ")}
                      </span>
                      <DeadlineBadgeChip badge={badge} />
                      <StatusSelect id={row.id} status={row.status} label={row.title} />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Notes rendered through the shared Markdown component (no raw HTML). */
export function OpportunityNotes({ notes }: { notes: string | null }) {
  if (!notes) return <p className="tk-empty-small">No notes.</p>;
  return <Markdown source={notes} className="career-notes" />;
}
