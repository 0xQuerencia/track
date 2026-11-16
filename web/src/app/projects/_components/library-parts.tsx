import Link from "next/link";
import { LIBRARY_VIEWS, PROJECT_STATUSES, SORT_KEYS, type LibraryView } from "@/lib/projects/constants";
import { libraryQueryString, type LibraryQuery } from "@/lib/projects/filters";
import type { LibraryFacets, LibraryRow } from "@/lib/projects/library";
import { chipsOf, formatWhen, repoLabel, safeHttpUrl } from "@/lib/projects/format";
import { progressOf } from "@/lib/projects/progress";

const VIEW_LABEL: Record<LibraryView, string> = {
  grid: "Grid",
  list: "Compact list",
  table: "Detailed table",
  kanban: "Kanban",
};

const SORT_LABEL: Record<(typeof SORT_KEYS)[number], string> = {
  name: "Name",
  activity: "Last activity",
  status: "Status",
  open: "Open tasks",
};

/** The filter form is a plain GET form, so it works without JavaScript. */
export function LibraryToolbar({ query, facets }: { query: LibraryQuery; facets: LibraryFacets }) {
  const withCurrent = (values: string[], current: string | null) =>
    current && !values.includes(current) ? [current, ...values] : values;
  return (
    <form method="get" action="/projects" className="pj-toolbar" role="search" aria-label="Filter projects">
      <input type="hidden" name="view" value={query.view} />
      <label className="pj-filter pj-filter-wide">
        <span>Search</span>
        <input type="search" name="q" defaultValue={query.q} maxLength={80} placeholder="Name, description, tags" />
      </label>
      <label className="pj-filter">
        <span>Status</span>
        <select name="status" defaultValue={query.status ?? ""}>
          <option value="">All</option>
          {PROJECT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </label>
      <label className="pj-filter">
        <span>Category</span>
        <select name="category" defaultValue={query.category ?? ""}>
          <option value="">Any</option>
          {withCurrent(facets.categories, query.category).map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </label>
      <label className="pj-filter">
        <span>Tag</span>
        <select name="tag" defaultValue={query.tag ?? ""}>
          <option value="">Any</option>
          {withCurrent(facets.tags, query.tag).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className="pj-filter">
        <span>Tech</span>
        <select name="tech" defaultValue={query.tech ?? ""}>
          <option value="">Any</option>
          {withCurrent(facets.tech, query.tech).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className="pj-filter">
        <span>Repository</span>
        <select name="repo" defaultValue={query.repo}>
          <option value="any">Any</option>
          <option value="yes">Has a repo</option>
          <option value="no">No repo</option>
        </select>
      </label>
      <label className="pj-filter">
        <span>Archived</span>
        <select name="archived" defaultValue={query.archived}>
          <option value="hide">Hide</option>
          <option value="show">Show</option>
          <option value="only">Only archived</option>
        </select>
      </label>
      <label className="pj-filter">
        <span>Sort by</span>
        <select name="sort" defaultValue={query.sort}>
          {SORT_KEYS.map((key) => <option key={key} value={key}>{SORT_LABEL[key]}</option>)}
        </select>
      </label>
      <div className="pj-toolbar-actions">
        <button type="submit" className="tk-button tk-primary">Apply</button>
        <Link className="pj-clear" href={`/projects${libraryQueryString({ view: query.view })}`}>Clear filters</Link>
      </div>
    </form>
  );
}

export function ViewSwitch({ query }: { query: LibraryQuery }) {
  return (
    <nav className="pj-views" aria-label="Layout">
      {LIBRARY_VIEWS.map((view) => (
        <Link
          key={view}
          href={`/projects${libraryQueryString({ ...query, view })}`}
          className="pj-view"
          aria-current={query.view === view ? "page" : undefined}
          scroll={false}
        >
          {VIEW_LABEL[view]}
        </Link>
      ))}
    </nav>
  );
}

export function Pager({ query, page, pageCount, total }: { query: LibraryQuery; page: number; pageCount: number; total: number }) {
  if (total === 0) return null;
  const href = (target: number) => `/projects${libraryQueryString({ ...query, page: target })}`;
  return (
    <nav className="pj-pager" aria-label="Pages">
      {page > 1 ? <Link href={href(page - 1)} className="tk-button tk-ghost">Previous</Link> : <span />}
      <span className="pj-pager-note">
        Page {page} of {pageCount} · {total} {total === 1 ? "project" : "projects"}
      </span>
      {page < pageCount ? <Link href={href(page + 1)} className="tk-button tk-ghost">Next</Link> : <span />}
    </nav>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <span className="pj-status-badge" data-status={status}>{status}</span>;
}

/** Progress from real milestone rows. The empty case says so instead of showing a number. */
export function ProgressMeter({
  done,
  total,
  emptyLabel = "No milestones",
}: {
  done: number;
  total: number;
  emptyLabel?: string;
}) {
  const progress = progressOf(done, total, emptyLabel);
  if (progress.percent === null) return <span className="pj-muted">{progress.label}</span>;
  return (
    <span className="pj-meter">
      <span
        className="pj-meter-bar"
        role="progressbar"
        aria-label={`Milestones ${progress.label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
      >
        <span style={{ width: `${progress.percent}%` }} />
      </span>
      <span className="pj-meter-label">{progress.label}</span>
    </span>
  );
}

export function RepoLink({ repo }: { repo: string | null }) {
  if (!repo) return <span className="pj-muted">No repo</span>;
  const href = safeHttpUrl(repo);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer noopener" className="pj-mono">{repoLabel(repo)}</a>
  ) : (
    <span className="pj-mono">{repo}</span>
  );
}

export function StackChips({ value }: { value: string | null }) {
  const items = chipsOf(value);
  if (items.length === 0) return null;
  return (
    <ul className="pj-chips" aria-label="Tech stack">
      {items.map((item) => <li key={item} className="pj-chip">{item}</li>)}
    </ul>
  );
}

export function activityText(row: Pick<LibraryRow, "last_activity_at" | "last_commit_at">): string {
  const when = row.last_activity_at ?? row.last_commit_at;
  return when ? formatWhen(when) : "No activity recorded";
}

export function branchOf(row: Pick<LibraryRow, "current_branch" | "default_branch">): string | null {
  return row.current_branch ?? row.default_branch ?? null;
}
