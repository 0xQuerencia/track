import { RelatedLinks } from "@/components/track/related-links";
import type { LinkView } from "@/lib/link-types";
import type { ActivityItem, ProjectRecord } from "@/lib/projects/detail";
import { milestoneSummary } from "@/lib/projects/detail";
import { chipsOf, formatWhen, repoLabel, safeHttpUrl } from "@/lib/projects/format";
import { ProjectForm, type ProjectFormDefaults } from "./project-form";
import { ProgressMeter, RepoLink, StackChips, branchOf } from "./library-parts";

function defaultsOf(project: ProjectRecord): ProjectFormDefaults {
  return {
    name: project.name,
    status: project.status,
    category: project.category ?? "",
    repo: project.repo ?? "",
    local_path: project.local_path ?? "",
    description: project.description ?? "",
    tags: chipsOf(project.tags).join(", "),
    tech_stack: chipsOf(project.tech_stack).join(", "),
    milestone_date: project.milestone_date ?? "",
    notes: project.notes ?? "",
    pinned: project.pinned === 1,
  };
}

export function OverviewTab({
  project,
  links,
  activity,
}: {
  project: ProjectRecord;
  links: LinkView[];
  activity: ActivityItem[];
}) {
  const { progress, next } = milestoneSummary(project.id);
  const branch = branchOf(project);
  return (
    <div className="pj-overview">
      <section className="pj-panel" aria-labelledby="pj-facts">
        <h2 id="pj-facts" className="pj-h2">Facts</h2>
        <dl className="pj-facts">
          <div><dt>Status</dt><dd>{project.status}</dd></div>
          <div><dt>Category</dt><dd>{project.category ?? "—"}</dd></div>
          <div><dt>Repository</dt><dd><RepoLink repo={project.repo} /></dd></div>
          <div><dt>Branch</dt><dd className="pj-mono">{branch ?? "—"}</dd></div>
          <div>
            <dt>Local path</dt>
            <dd className="pj-mono">{project.local_path ?? "—"}</dd>
          </div>
          <div>
            <dt>Last commit</dt>
            <dd>
              {project.last_commit_message ? (
                <>
                  {project.last_commit_message}
                  <span className="pj-muted"> · {formatWhen(project.last_commit_at)}</span>
                </>
              ) : (
                "No commit recorded"
              )}
            </dd>
          </div>
          <div><dt>Last activity</dt><dd>{formatWhen(project.last_activity_at)}</dd></div>
          <div><dt>Source</dt><dd>{project.source === "import" ? "Inventory import" : "Added by hand"}</dd></div>
        </dl>
        <StackChips value={project.tech_stack} />
        {project.description ? <p className="pj-body">{project.description}</p> : null}
        {safeHttpUrl(project.repo) ? (
          <p className="pj-muted">Repository: {repoLabel(project.repo)}</p>
        ) : null}
      </section>

      <section className="pj-panel" aria-labelledby="pj-next">
        <h2 id="pj-next" className="pj-h2">Next milestone</h2>
        {next ? (
          <p className="pj-next">
            {next.title}
            {next.due_date ? <span className="pj-muted"> · due {formatWhen(next.due_date)}</span> : null}
          </p>
        ) : project.milestone ? (
          <p className="pj-next">{project.milestone}<span className="pj-muted"> · typed in, not on the roadmap</span></p>
        ) : (
          <p className="pj-muted">No milestones</p>
        )}
        <ProgressMeter done={progress.done} total={progress.total} />
      </section>

      <section className="pj-panel" aria-labelledby="pj-activity">
        <h2 id="pj-activity" className="pj-h2">Recent activity</h2>
        {activity.length === 0 ? (
          <p className="tk-empty">No activity yet. Repository events and history appear here as they happen.</p>
        ) : (
          <ul className="pj-activity">
            {activity.map((item, index) => (
              <li key={`${item.source}-${index}`}>
                <span className="pj-muted">{formatWhen(item.at)}</span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pj-panel" aria-labelledby="pj-links">
        <RelatedLinks type="projects" id={project.id} links={links} title="Related records" />
      </section>

      <section className="pj-panel" aria-labelledby="pj-edit">
        <h2 id="pj-edit" className="pj-h2">Edit details</h2>
        <details className="tk-add">
          <summary>Edit this project</summary>
          <ProjectForm mode="edit" projectId={project.id} defaults={defaultsOf(project)} />
        </details>
        <p className="pj-muted">
          Git fields and the local path are refreshed by inventory imports. Changing the name here renames its backlog
          items too.
        </p>
      </section>
    </div>
  );
}
