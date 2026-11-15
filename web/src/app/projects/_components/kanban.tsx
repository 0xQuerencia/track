import Link from "next/link";
import type { ProjectStatus } from "@/lib/projects/constants";
import type { LibraryPage } from "@/lib/projects/library";
import { ProgressMeter, StatusBadge } from "./library-parts";

/** One column per status. Each column shows at most KANBAN_LIMIT cards; the count is always the real total. */
export function Kanban({ columns }: { columns: { status: ProjectStatus; page: LibraryPage }[] }) {
  return (
    <div className="pj-kanban" aria-label="Projects by status">
      {columns.map(({ status, page }) => (
        <section key={status} className="pj-kanban-col" data-status={status} aria-label={status}>
          <header className="pj-kanban-head">
            <StatusBadge status={status} />
            <span className="tk-count">{page.total}</span>
          </header>
          {page.rows.length === 0 ? (
            <p className="tk-empty-small">No {status.toLowerCase()} projects.</p>
          ) : (
            <ul className="pj-kanban-list">
              {page.rows.map((row) => (
                <li key={row.id} className="pj-kanban-card">
                  <Link href={`/projects/${row.id}`}>{row.name}</Link>
                  {row.category ? <span className="pj-muted">{row.category}</span> : null}
                  <ProgressMeter done={row.milestone_done} total={row.milestone_total} />
                  <span className="pj-muted">{row.open_tasks} open tasks</span>
                </li>
              ))}
            </ul>
          )}
          {page.total > page.rows.length ? (
            <p className="pj-muted pj-kanban-more">
              Showing {page.rows.length} of {page.total}. Filter to see the rest.
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}
