import Link from "next/link";
import {
  SESSION_STATUS_LABELS,
  SESSION_TOOL_LABELS,
  SESSION_TOOLS,
  SESSION_STATUSES,
  type SessionStatus,
} from "@/lib/sessions/constants";
import { filtersToQuery, type SessionFilters } from "@/lib/sessions/filters";
import type { GroupPage, SessionListRow } from "@/lib/sessions/queries";
import { formatWhen } from "@/lib/sessions/format";

export type ProjectFilterOption = { id: number; name: string };

/** GET form: works without JavaScript, and every choice is in the URL. */
export function FilterBar({
  filters,
  projects,
}: {
  filters: SessionFilters;
  projects: ProjectFilterOption[];
}) {
  return (
    <form method="get" action="/sessions" className="ses-filters" role="search">
      <label className="tk-field">
        <span>Search</span>
        <input type="search" name="q" defaultValue={filters.q} maxLength={80} placeholder="Title, folder or id" />
      </label>
      <label className="tk-field">
        <span>Tool</span>
        <select name="tool" defaultValue={filters.tool ?? ""}>
          <option value="">All tools</option>
          {SESSION_TOOLS.map((tool) => (
            <option key={tool} value={tool}>{SESSION_TOOL_LABELS[tool]}</option>
          ))}
        </select>
      </label>
      <label className="tk-field">
        <span>Status</span>
        <select name="status" defaultValue={filters.status ?? ""}>
          <option value="">Any status</option>
          {SESSION_STATUSES.map((status) => (
            <option key={status} value={status}>{SESSION_STATUS_LABELS[status]}</option>
          ))}
        </select>
      </label>
      <label className="tk-field">
        <span>Project</span>
        <select name="project" defaultValue={filters.project === null ? "" : String(filters.project)}>
          <option value="">Any project</option>
          <option value="none">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      </label>
      <label className="tk-field">
        <span>Linked</span>
        <select name="linked" defaultValue={filters.linked ?? ""}>
          <option value="">Linked or not</option>
          <option value="yes">Linked</option>
          <option value="no">Not linked</option>
        </select>
      </label>
      <label className="tk-field">
        <span>Sort</span>
        <select name="sort" defaultValue={filters.sort}>
          <option value="recent">Most recent activity</option>
          <option value="oldest">Oldest activity</option>
          <option value="title">Title A to Z</option>
          <option value="tool">Tool</option>
        </select>
      </label>
      <label className="tk-field">
        <span>View</span>
        <select name="group" defaultValue={filters.group}>
          <option value="none">Chronological list</option>
          <option value="project">Grouped by project</option>
          <option value="tool">Grouped by tool</option>
        </select>
      </label>
      <div className="ses-filter-actions">
        <button type="submit" className="tk-button tk-primary">Apply</button>
        <Link href="/sessions" className="tk-button">Reset</Link>
      </div>
    </form>
  );
}

function StatusTag({ status }: { status: SessionStatus }) {
  return (
    <span className="ses-status" data-status={status}>
      {SESSION_STATUS_LABELS[status]}
    </span>
  );
}

function SessionRow({ row }: { row: SessionListRow }) {
  return (
    <tr>
      <td>
        <Link href={`/sessions/${row.id}`}>{row.title ?? row.externalId}</Link>
        {row.cwdHint ? <small className="ses-path">{row.cwdHint}</small> : null}
      </td>
      <td>{SESSION_TOOL_LABELS[row.tool]}</td>
      <td>
        {row.projectName ? (
          <Link href={`/sessions?project=${row.projectId}`}>{row.projectName}</Link>
        ) : (
          <span className="ses-muted">{row.projectHint ? `Hint: ${row.projectHint}` : "Not linked"}</span>
        )}
      </td>
      <td>{formatWhen(row.lastActivityAt)}</td>
      <td><StatusTag status={row.status} /></td>
    </tr>
  );
}

export function SessionTable({ rows }: { rows: SessionListRow[] }) {
  return (
    <div className="tk-table-wrap">
      <table className="tk-table ses-table">
        <thead>
          <tr>
            <th scope="col">Session</th>
            <th scope="col">Tool</th>
            <th scope="col">Project</th>
            <th scope="col">Last activity</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <SessionRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GroupList({
  page,
  filters,
}: {
  page: GroupPage;
  filters: SessionFilters;
}) {
  return (
    <div className="ses-groups">
      {page.groups.map((group) => {
        const drill: Partial<SessionFilters> =
          filters.group === "project"
            ? { project: group.key === "none" ? "none" : Number(group.key) }
            : { tool: group.key as SessionFilters["tool"] };
        return (
          <section key={group.key} className="tk-panel ses-group" aria-label={group.label}>
            <header className="tk-panel-head">
              <div>
                <h2>{group.label}</h2>
                <p>Last activity {formatWhen(group.latest)}</p>
              </div>
              <Link className="tk-count" href={`/sessions${filtersToQuery({ ...filters, ...drill, group: "none", page: 1 })}`}>
                {group.count} total
              </Link>
            </header>
            <SessionTable rows={group.preview} />
          </section>
        );
      })}
    </div>
  );
}

export function Pager({
  filters,
  total,
  pageSize,
}: {
  filters: SessionFilters;
  total: number;
  pageSize: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const prev = filters.page > 1 ? filters.page - 1 : null;
  const next = filters.page < pages ? filters.page + 1 : null;
  return (
    <nav className="ses-pager" aria-label="Pages">
      {prev ? (
        <Link className="tk-button" href={`/sessions${filtersToQuery({ ...filters, page: prev })}`}>Previous</Link>
      ) : (
        <span className="tk-button" aria-disabled="true">Previous</span>
      )}
      <span className="ses-muted">Page {filters.page} of {pages}</span>
      {next ? (
        <Link className="tk-button" href={`/sessions${filtersToQuery({ ...filters, page: next })}`}>Next</Link>
      ) : (
        <span className="tk-button" aria-disabled="true">Next</span>
      )}
    </nav>
  );
}
