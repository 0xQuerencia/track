import Link from "next/link";
import { notFound } from "next/navigation";
import { Page, Panel, SplitPanels } from "@/components/track/page";
import { RelatedLinks } from "@/components/track/related-links";
import { getDb } from "@/lib/db";
import { listLinks } from "@/lib/links";
import { SESSION_TOOL_LABELS } from "@/lib/sessions/constants";
import { formatWhen } from "@/lib/sessions/format";
import { backlogForProject, getSessionDetail, projectOptions } from "@/lib/sessions/queries";
import { ProjectPicker } from "../_components/project-picker";
import { NotesEditor } from "../_components/notes-editor";
import { CopyCommand } from "../_components/copy-command";
import { deleteSessionAction } from "../actions";
import "@/styles/sessions.css";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = /^\d{1,12}$/.test(rawId) ? Number(rawId) : NaN;
  const db = getDb();
  const session = Number.isInteger(id) && id > 0 ? getSessionDetail(db, id) : null;
  if (!session) notFound();

  const projects = projectOptions(db);
  const backlog = session.projectName ? backlogForProject(db, session.projectName) : [];
  const links = listLinks("ai_session", String(session.id));
  const running = session.status === "running_verified";

  return (
    <Page
      kicker="AI session"
      title={session.title ?? session.externalId}
      lede={`${SESSION_TOOL_LABELS[session.tool]} session. Last activity ${formatWhen(session.lastActivityAt)}.`}
    >
      <p className="ses-banner" data-status={session.status}>
        {running
          ? "Running (verified): a process of this tool is running in this session's folder. It is not proof that this exact session is the one running."
          : "Saved record, not a running process. This is a copy of metadata from an earlier report."}
      </p>

      <SplitPanels>
        <Panel title="Details">
          <dl className="ses-meta">
            <dt>Tool</dt>
            <dd>{SESSION_TOOL_LABELS[session.tool]}</dd>
            <dt>Session id</dt>
            <dd className="ses-mono">{session.externalId}</dd>
            <dt>Folder</dt>
            <dd className="ses-mono">{session.cwdHint ?? "Not reported"}</dd>
            <dt>Project hint</dt>
            <dd className="ses-mono">{session.projectHint ?? "Not reported"}</dd>
            <dt>Started</dt>
            <dd>{formatWhen(session.createdAt)}</dd>
            <dt>Last activity</dt>
            <dd>{formatWhen(session.lastActivityAt)}</dd>
            <dt>Model</dt>
            <dd>{session.model ?? "Not reported"}</dd>
            <dt>Messages</dt>
            <dd>{session.messageCount ?? "Not counted"}</dd>
            <dt>Source</dt>
            <dd>{session.source === "connector" ? "Linux connector" : "Pasted by hand"}</dd>
            <dt>Last synced</dt>
            <dd>{formatWhen(session.synced)}</dd>
          </dl>
          <small className="ses-hint">Only metadata is stored. Message text is never read or saved.</small>
        </Panel>

        <Panel title="Project" description="Automatic links come from an exact folder, path or repository match.">
          <ProjectPicker
            sessionId={session.id}
            currentProjectId={session.projectId}
            source={session.projectLinkSource}
            projects={projects}
          />
        </Panel>
      </SplitPanels>

      <SplitPanels>
        <Panel title="Resume" description="The documented command to reopen this session, as reported. Track displays it and never runs it.">
          {session.resumeCommand ? (
            <>
              <pre className="ses-command" aria-label="Resume command">{session.resumeCommand}</pre>
              <CopyCommand command={session.resumeCommand} />
            </>
          ) : (
            <p className="tk-empty">No resume command was reported for this session.</p>
          )}
        </Panel>

        <Panel title="Notes" description="Your own notes. Plain text.">
          <NotesEditor sessionId={session.id} notes={session.notes} />
        </Panel>
      </SplitPanels>

      <Panel
        title="Summary"
        description={session.summary ? "Stored because summaries are on for this tool." : "Not stored. Summaries are off by default."}
      >
        {session.summary ? (
          <pre className="ses-summary">{session.summary}</pre>
        ) : (
          <p className="tk-empty">
            No summary. Turn on summaries for this tool on the{" "}
            <Link href="/integrations">Integrations</Link> page if you want them kept.
          </p>
        )}
      </Panel>

      {session.projectName ? (
        <Panel title={`Backlog for ${session.projectName}`} description="Items on the linked project, by name.">
          {backlog.length === 0 ? (
            <p className="tk-empty">No backlog items. Add some on the <Link href="/projects">Projects</Link> page.</p>
          ) : (
            <ul className="ses-backlog">
              {backlog.map((item) => (
                <li key={item.id}>
                  <span>{item.title}</span>
                  <small>{item.status}</small>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      <RelatedLinks type="ai_session" id={session.id} links={links} title="Related records" />

      <Panel title="Forget this record" description="Deletes this saved copy and its links. The tool's own files are not touched, and the next sync may report it again.">
        <form action={deleteSessionAction}>
          <input type="hidden" name="id" value={session.id} />
          <button type="submit" className="tk-button tk-danger">Delete saved record</button>
        </form>
      </Panel>
    </Page>
  );
}
