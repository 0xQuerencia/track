import { listLinkedSessions } from "@/lib/projects/sessions";
import { formatWhen } from "@/lib/projects/format";

/*
 * AI sessions linked to a project (record_links, relation session_of).
 * Tolerates the Sessions feature not being present: with no table or no
 * links it shows an empty state instead of failing.
 */
export function ProjectSessionsPanel({ projectId }: { projectId: number }) {
  const sessions = listLinkedSessions(projectId);
  if (sessions.length === 0) {
    return (
      <section className="pj-sessions" aria-label="AI sessions">
        <p className="tk-empty">
          No AI sessions are linked to this project yet. Linked sessions appear here with their title, tool and last
          activity.
        </p>
      </section>
    );
  }
  return (
    <section className="pj-sessions" aria-label="AI sessions">
      <ul className="pj-session-list">
        {sessions.map((session) => (
          <li key={session.linkId} className="pj-session">
            <p className="pj-session-title">{session.title ?? `Session ${session.sessionId}`}</p>
            <p className="pj-session-meta">
              {session.tool ? <span className="pj-tag">{session.tool}</span> : null}
              <span>{session.lastActivity ? `Last activity ${formatWhen(session.lastActivity)}` : "No activity time recorded"}</span>
              {session.known ? null : <span className="pj-muted">Session record not found in this database</span>}
            </p>
            {session.note ? <p className="pj-session-note">{session.note}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
