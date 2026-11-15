import Link from "next/link";
import type { WidgetSpec } from "@/components/track/widget-board";
import { getUpcomingItems } from "@/lib/calendar/aggregate";
import { getUpcomingOpportunities } from "@/lib/career";
import { shortDay } from "@/lib/dates";
import { getDeviceSummary, getServiceStatuses } from "@/lib/devices";
import { getExpiringDocuments } from "@/lib/documents";
import { getDb } from "@/lib/db";
import { getMoneySnapshot } from "@/lib/money";
import { getGoalSummaries, getOverdueTasks } from "@/lib/plans";
import { getRevisionQueue, getTodayStudyTargets } from "@/lib/study";

/*
 * Command Center widgets that read from the newer modules. Each one shows real
 * rows or an honest empty state; nothing is estimated.
 */

type Row = Record<string, string | number | null>;
const rows = (sql: string, ...params: (string | number)[]): Row[] =>
  getDb().prepare(sql).all(...params) as Row[];

const Empty = ({ children }: { children: React.ReactNode }) => <p className="tk-empty">{children}</p>;

export function extraWidgets(today: string): WidgetSpec[] {
  const month = today.slice(0, 7);
  const agenda = getUpcomingItems(7).slice(0, 6);
  const overdue = getOverdueTasks(today);
  const revisions = getRevisionQueue(today, 4);
  const revisionState = revisions.length === 0 ? getTodayStudyTargets(today).revisionState : "ready";
  const goals = getGoalSummaries(4);
  const opportunities = getUpcomingOpportunities(4);
  const expiring = getExpiringDocuments(60).slice(0, 3);
  const ideas = rows(
    `SELECT id, title, status FROM ideas WHERE archived = 0 AND status IN ('Inbox','Exploring','Planned','Building') ORDER BY pinned DESC, updated_at DESC, id DESC LIMIT 4`,
  );
  const notes = rows(`SELECT id, title FROM notes WHERE pinned = 1 ORDER BY updated_at DESC LIMIT 3`);
  const sessionStats = rows(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN project_id IS NULL THEN 1 ELSE 0 END) AS unlinked FROM ai_sessions`,
  )[0];
  const recentSessions = rows(
    `SELECT id, tool, title FROM ai_sessions WHERE last_activity_at IS NOT NULL ORDER BY last_activity_at DESC LIMIT 4`,
  );
  const money = getMoneySnapshot(month);
  const devices = getDeviceSummary();
  const services = getServiceStatuses();
  const integrations = rows(
    `SELECT key, status, last_success_at, last_error FROM integrations WHERE enabled = 1 OR status != 'Not connected'`,
  );

  return [
    {
      id: "agenda",
      title: "Agenda, next 7 days",
      wide: true,
      content:
        agenda.length === 0 ? (
          <Empty>Nothing dated. <Link href="/calendar">Open the calendar.</Link></Empty>
        ) : (
          <ul className="tk-list">
            {agenda.map((item) => (
              <li key={item.id}>
                <Link href={item.href}>{item.title}</Link>
                <small>{shortDay(item.date)}{item.time ? ` · ${item.time}` : ""}</small>
              </li>
            ))}
          </ul>
        ),
    },
    {
      id: "overdue",
      title: "Overdue tasks",
      content:
        overdue.length === 0 ? (
          <Empty>Nothing overdue.</Empty>
        ) : (
          <ul className="tk-list">
            {overdue.slice(0, 5).map((t) => (
              <li key={t.id}><span>{t.title}</span><small>{t.due ? shortDay(t.due) : ""}</small></li>
            ))}
          </ul>
        ),
    },
    {
      id: "revision",
      title: "Revision queue",
      content:
        revisions.length === 0 ? (
          <Empty>
            {revisionState === "no_chapters"
              ? "No chapters yet."
              : revisionState === "none_covered"
                ? "No chapter is marked covered yet, so there is nothing to revise."
                : "Nothing is due for revision."}{" "}
            <Link href="/study">Open Study HQ.</Link>
          </Empty>
        ) : (
          <ul className="tk-list">
            {revisions.map((r) => (
              <li key={r.chapterId} title={r.reasons.join("; ")}>
                <span>{r.name}</span>
                <small>{r.reasons[0] ?? r.subject}</small>
              </li>
            ))}
          </ul>
        ),
    },
    {
      id: "goals",
      title: "Goals",
      content:
        goals.length === 0 ? (
          <Empty>No goals yet. <Link href="/plans">Set one in Plans.</Link></Empty>
        ) : (
          <ul className="tk-list">
            {goals.map((g) => (
              <li key={g.id}>
                <span>{g.title}</span>
                <small>{g.reviewDue ? "review due" : g.status}</small>
              </li>
            ))}
          </ul>
        ),
    },
    {
      id: "deadlines",
      title: "Career and documents",
      content:
        opportunities.length + expiring.length === 0 ? (
          <Empty>No open deadlines or expiring documents.</Empty>
        ) : (
          <ul className="tk-list">
            {opportunities.map((o) => (
              <li key={`o${o.id}`}>
                <Link href={o.href}>{o.title}</Link>
                <small>{o.daysLeft === 0 ? "today" : `${o.daysLeft} d`}</small>
              </li>
            ))}
            {expiring.map((d) => (
              <li key={`d${d.id}`}>
                <Link href={d.href}>{d.title}</Link>
                <small>{d.expired ? "expired" : `expires in ${d.daysLeft} d`}</small>
              </li>
            ))}
          </ul>
        ),
    },
    {
      id: "ideas",
      title: "Ideas and notes",
      content:
        ideas.length + notes.length === 0 ? (
          <Empty>Nothing captured. <Link href="/ideas?new=1">Capture an idea.</Link></Empty>
        ) : (
          <ul className="tk-list">
            {ideas.map((i) => (
              <li key={`i${i.id}`}><Link href={`/ideas/${i.id}`}>{String(i.title)}</Link><small>{String(i.status)}</small></li>
            ))}
            {notes.map((n) => (
              <li key={`n${n.id}`}><Link href={`/knowledge/${n.id}`}>{String(n.title)}</Link><small>pinned</small></li>
            ))}
          </ul>
        ),
    },
    {
      id: "sessions",
      title: "AI sessions",
      content:
        Number(sessionStats?.total ?? 0) === 0 ? (
          <Empty>No sessions imported. <Link href="/sessions">Set up the connector.</Link></Empty>
        ) : (
          <>
            <ul className="tk-list">
              {recentSessions.map((s) => (
                <li key={String(s.id)}>
                  <Link href={`/sessions/${s.id}`}>{String(s.title || `${s.tool} session`)}</Link>
                  <small>{String(s.tool)}</small>
                </li>
              ))}
            </ul>
            <p className="tk-widget-foot">
              {String(sessionStats.total)} saved · {String(sessionStats.unlinked ?? 0)} not linked to a project
            </p>
          </>
        ),
    },
    {
      id: "money",
      title: "Money this month",
      content: (
        <ul className="tk-list">
          <li><span>Income</span><small>{money.income}</small></li>
          <li><span>Spent</span><small>{money.spent}</small></li>
          <li><span>Budget used</span><small>{money.budget.percentUsed === null ? "No budget set" : `${money.budget.percentUsed}%`}</small></li>
          <li><span>Savings</span><small>{money.savings.goals ? `${money.savings.saved} of ${money.savings.target}` : "No goals"}</small></li>
        </ul>
      ),
    },
    {
      id: "system",
      title: "System",
      content: (
        <ul className="tk-list">
          <li><span>Devices</span><small>{devices.total ? `${devices.online} online · ${devices.unknown} unknown` : "None added"}</small></li>
          <li><span>Services</span><small>{services.total ? `${services.up} up · ${services.down} down · ${services.unknown} unknown` : "None added"}</small></li>
          {integrations.length === 0 ? (
            <li><span>Integrations</span><small>Not connected</small></li>
          ) : (
            integrations.map((i) => (
              <li key={String(i.key)}>
                <span>{String(i.key)}</span>
                <small>
                  {String(i.status)}
                  {i.last_success_at ? ` · last sync ${shortDay(String(i.last_success_at).slice(0, 10))}` : ""}
                  {i.last_error ? " · error" : ""}
                </small>
              </li>
            ))
          )}
        </ul>
      ),
    },
  ];
}

