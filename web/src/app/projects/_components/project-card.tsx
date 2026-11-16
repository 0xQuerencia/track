import Link from "next/link";
import type { LibraryRow } from "@/lib/projects/library";
import { chipsOf } from "@/lib/projects/format";
import { ProgressMeter, RepoLink, StackChips, StatusBadge, branchOf, activityText } from "./library-parts";

/** One project in the grid. Every number on it comes from stored records. */
export function ProjectCard({ row }: { row: LibraryRow }) {
  const tags = chipsOf(row.tags);
  return (
    <article className="pj-card" data-status={row.status} data-archived={row.archived === 1 || undefined}>
      <header className="pj-card-head">
        <StatusBadge status={row.status} />
        {row.category ? <span className="pj-tag">{row.category}</span> : null}
        {row.pinned === 1 ? <span className="pj-tag" data-tone="accent">Pinned</span> : null}
        {row.archived === 1 ? <span className="pj-tag">Archived</span> : null}
      </header>
      <h2 className="pj-card-title">
        <Link href={`/projects/${row.id}`}>{row.name}</Link>
      </h2>
      {row.description ? <p className="pj-card-desc">{row.description}</p> : null}
      <StackChips value={row.tech_stack} />
      {row.local_path ? (
        <p className="pj-card-path pj-mono" title="Reference only; this app does not read the folder">{row.local_path}</p>
      ) : null}
      <dl className="pj-card-facts">
        <div>
          <dt>Repo</dt>
          <dd><RepoLink repo={row.repo} /></dd>
        </div>
        <div>
          <dt>Branch</dt>
          <dd className="pj-mono">{branchOf(row) ?? "—"}</dd>
        </div>
        <div>
          <dt>Activity</dt>
          <dd>{activityText(row)}</dd>
        </div>
        <div>
          <dt>Next milestone</dt>
          <dd>
            {row.next_milestone ?? (row.milestone_total === 0 && row.milestone ? row.milestone : "No milestones")}
          </dd>
        </div>
      </dl>
      <div className="pj-card-progress">
        <ProgressMeter done={row.milestone_done} total={row.milestone_total} />
      </div>
      <footer className="pj-card-foot">
        <span>{row.open_tasks} open {row.open_tasks === 1 ? "task" : "tasks"}</span>
        <span>{row.sessions} AI {row.sessions === 1 ? "session" : "sessions"}</span>
      </footer>
      {tags.length ? (
        <ul className="pj-chips" aria-label="Tags">
          {tags.map((tag) => <li key={tag} className="pj-chip" data-kind="tag">{tag}</li>)}
        </ul>
      ) : null}
    </article>
  );
}

