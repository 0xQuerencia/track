import Link from "next/link";
import { REPO_EVENT_KINDS, type RepoEventKind } from "@/lib/projects/constants";
import { formatWhen, safeHttpUrl } from "@/lib/projects/format";
import { listRepoEvents, repoEventCounts } from "@/lib/projects/repo-events";
import type { ProjectRecord } from "@/lib/projects/detail";
import { RepoLink, branchOf } from "./library-parts";

const KIND_LABEL: Record<RepoEventKind, string> = {
  commit: "Commits",
  branch: "Branches",
  pr: "Pull requests",
  issue: "Issues",
  release: "Releases",
  worktree: "Worktrees",
};

export function DevelopmentTab({
  project,
  kind,
}: {
  project: ProjectRecord;
  kind: RepoEventKind | null;
}) {
  const counts = repoEventCounts(project.id);
  const events = listRepoEvents(project.id, { kind, limit: 200 });
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <div className="pj-dev">
      <section className="pj-panel" aria-labelledby="pj-dev-head">
        <h2 id="pj-dev-head" className="pj-h2">Repository</h2>
        <dl className="pj-facts">
          <div><dt>Repository</dt><dd><RepoLink repo={project.repo} /></dd></div>
          <div><dt>Branch</dt><dd className="pj-mono">{branchOf(project) ?? "—"}</dd></div>
          <div>
            <dt>Last commit</dt>
            <dd>
              {project.last_commit_sha ? (
                <>
                  <span className="pj-mono">{project.last_commit_sha.slice(0, 8)}</span>{" "}
                  {project.last_commit_message ?? ""}
                  <span className="pj-muted"> · {formatWhen(project.last_commit_at)}</span>
                </>
              ) : (
                "No commit recorded"
              )}
            </dd>
          </div>
        </dl>
      </section>

      <nav className="pj-kinds" aria-label="Filter by kind">
        <Link href={`?tab=development`} scroll={false} className="pj-view" aria-current={kind === null ? "page" : undefined}>
          All ({total})
        </Link>
        {REPO_EVENT_KINDS.map((item) => (
          <Link
            key={item}
            href={`?tab=development&kind=${item}`}
            scroll={false}
            className="pj-view"
            aria-current={kind === item ? "page" : undefined}
          >
            {KIND_LABEL[item]} ({counts[item]})
          </Link>
        ))}
      </nav>

      {events.length === 0 ? (
        <p className="tk-empty">
          No repository activity has been imported for this project. Commits, branches, pull requests, issues, releases
          and worktrees appear here once a GitHub or connector import sends them. Nothing is fabricated while none has
          arrived.
        </p>
      ) : (
        <ul className="pj-events" aria-label="Repository events">
          {events.map((event) => {
            const url = safeHttpUrl(event.url);
            return (
              <li key={event.id} className="pj-event" data-kind={event.kind}>
                <span className="pj-tag">{KIND_LABEL[event.kind].replace(/s$/, "")}</span>
                <span className="pj-event-title">
                  {url ? <a href={url} target="_blank" rel="noreferrer noopener">{event.title ?? event.external_id}</a> : event.title ?? event.external_id}
                </span>
                <span className="pj-muted">
                  {[event.author, event.state, formatWhen(event.occurred_at)].filter(Boolean).join(" · ")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
