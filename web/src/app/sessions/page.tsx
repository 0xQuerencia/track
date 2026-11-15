import Link from "next/link";
import { Page, Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { getDb } from "@/lib/db";
import { formatWhen } from "@/lib/sessions/format";
import { PAGE_SIZE, SESSION_TOOL_LABELS } from "@/lib/sessions/constants";
import { parseSessionFilters, filtersToQuery } from "@/lib/sessions/filters";
import {
  countSessions,
  dashboardStats,
  listGroups,
  listSessionPage,
  projectOptions,
} from "@/lib/sessions/queries";
import { listIntegrations, lastSuccessfulSync } from "@/lib/integrations/store";
import { nowIso } from "@/lib/integrations/time";
import { INTEGRATION_META } from "@/lib/integrations/catalog";
import { Explorer } from "./_components/explorer-section";
import "@/styles/sessions.css";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SessionsPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseSessionFilters(await searchParams);
  const db = getDb();
  const now = nowIso();
  const stats = dashboardStats(db, now);
  const integrations = listIntegrations(db, now);
  const lastSync = lastSuccessfulSync(db);
  const projects = projectOptions(db);
  const isEmpty = stats.total === 0;

  return (
    <Page
      kicker="Work"
      title="AI sessions"
      lede="Saved records of your AI coding sessions, reported by the Linux connector or pasted by hand. Only metadata is kept."
    >
      {isEmpty ? (
        <Panel title="No sessions yet" description="Two ways to fill this page.">
          <ul className="ses-steps">
            <li>
              Run the Linux connector on this machine. Create a token in{" "}
              <Link href="/settings">Settings</Link>, then follow the steps in{" "}
              <code>web/tools/track-connector/README.md</code>.
            </li>
            <li>
              Or paste an export of session metadata on the <Link href="/integrations">Integrations</Link> page.
            </li>
          </ul>
        </Panel>
      ) : null}

      <StatGrid>
        <StatCard label="Sessions" value={stats.total} />
        <StatCard label="Active in the last 7 days" value={stats.activeLastWeek} />
        <StatCard label="Saved records" value={stats.byStatus.historical} hint="Not running processes" />
        <StatCard label="Running (verified)" value={stats.byStatus.running_verified} hint="A process is in the session's folder" />
        <StatCard label="Not linked to a project" value={stats.unlinked} />
      </StatGrid>

      <SplitPanels>
        <Panel title="By tool" description="Count of saved records per tool.">
          {stats.byTool.length === 0 ? (
            <p className="tk-empty">No sessions yet.</p>
          ) : (
            <ul className="ses-counts">
              {stats.byTool.map((row) => (
                <li key={row.tool}>
                  <Link href={`/sessions?tool=${row.tool}`}>{SESSION_TOOL_LABELS[row.tool]}</Link>
                  <span className="tk-count">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="By project" description="The busiest projects, plus sessions with none.">
          {stats.byProject.length === 0 ? (
            <p className="tk-empty">No sessions yet.</p>
          ) : (
            <ul className="ses-counts">
              {stats.byProject.map((row) => (
                <li key={row.projectId ?? "none"}>
                  <Link href={`/sessions${filtersToQuery({ project: row.projectId ?? "none" })}`}>{row.label}</Link>
                  <span className="tk-count">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </SplitPanels>

      <SplitPanels>
        <Panel title="Integration health" description="From the last reports received. Connected turns Stale after a day without a success.">
          <ul className="ses-health">
            {integrations
              .filter((row) => row.key !== "github")
              .map((row) => (
                <li key={row.key} data-status={row.enabled ? row.status : "disabled"}>
                  <Link href="/integrations">{INTEGRATION_META[row.key].label}</Link>
                  <span>{row.enabled ? row.status : "Disabled"}</span>
                  <small>Last success {formatWhen(row.lastSuccessAt)}</small>
                </li>
              ))}
          </ul>
          <p className="ses-hint">
            Last successful sync across all integrations: {formatWhen(lastSync)}.
          </p>
        </Panel>
        <Panel title="Most recent" description="The five latest sessions by activity.">
          {stats.recent.length === 0 ? (
            <p className="tk-empty">Nothing yet.</p>
          ) : (
            <ul className="ses-recent">
              {stats.recent.map((row) => (
                <li key={row.id}>
                  <Link href={`/sessions/${row.id}`}>{row.title ?? row.externalId}</Link>
                  <small>{formatWhen(row.lastActivityAt)}</small>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </SplitPanels>

      <Explorer
        filters={filters}
        projects={projects}
        total={countSessions(db, filters)}
        rows={filters.group === "none" ? listSessionPage(db, filters, PAGE_SIZE) : []}
        groups={filters.group === "none" ? null : listGroups(db, filters, filters.group)}
      />
    </Page>
  );
}
