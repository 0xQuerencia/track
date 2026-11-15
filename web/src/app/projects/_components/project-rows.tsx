import Link from "next/link";
import type { LibraryRow } from "@/lib/projects/library";
import { formatWhen } from "@/lib/projects/format";
import { ProgressMeter, RepoLink, StatusBadge, activityText, branchOf } from "./library-parts";

/** Dense list: one line per project with the numbers that matter at a glance. */
export function ProjectList({ rows }: { rows: LibraryRow[] }) {
  return (
    <ul className="pj-list" aria-label="Projects">
      {rows.map((row) => (
        <li key={row.id} className="pj-list-row" data-status={row.status}>
          <StatusBadge status={row.status} />
          <Link href={`/projects/${row.id}`} className="pj-list-name">{row.name}</Link>
          <span className="pj-muted">{row.category ?? "—"}</span>
          <span className="pj-mono">{branchOf(row) ?? "—"}</span>
          <span>{activityText(row)}</span>
          <span>{row.open_tasks} open</span>
          <ProgressMeter done={row.milestone_done} total={row.milestone_total} />
        </li>
      ))}
    </ul>
  );
}

/** Full table with every stored column that a project has. */
export function ProjectTable({ rows }: { rows: LibraryRow[] }) {
  return (
    <div className="tk-table-wrap pj-table-wrap">
      <table className="tk-table pj-table">
        <caption className="pj-sr-only">Projects, detailed</caption>
        <thead>
          <tr>
            <th scope="col">Project</th>
            <th scope="col">Status</th>
            <th scope="col">Category</th>
            <th scope="col">Stack</th>
            <th scope="col">Repo</th>
            <th scope="col">Branch</th>
            <th scope="col">Last activity</th>
            <th scope="col">Last commit</th>
            <th scope="col">Next milestone</th>
            <th scope="col">Progress</th>
            <th scope="col">Open tasks</th>
            <th scope="col">Sessions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><Link href={`/projects/${row.id}`}>{row.name}</Link></td>
              <td><StatusBadge status={row.status} /></td>
              <td>{row.category ?? "—"}</td>
              <td>{row.tech_stack ?? "—"}</td>
              <td><RepoLink repo={row.repo} /></td>
              <td className="pj-mono">{branchOf(row) ?? "—"}</td>
              <td>{formatWhen(row.last_activity_at)}</td>
              <td>{row.last_commit_message ? `${row.last_commit_message.slice(0, 60)}` : "—"}</td>
              <td>{row.next_milestone ?? "—"}</td>
              <td><ProgressMeter done={row.milestone_done} total={row.milestone_total} /></td>
              <td data-align="end">{row.open_tasks}</td>
              <td data-align="end">{row.sessions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
