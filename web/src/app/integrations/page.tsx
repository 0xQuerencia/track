import { Page, Panel } from "@/components/track/page";
import { getDb } from "@/lib/db";
import { recentRuns, listIntegrations } from "@/lib/integrations/store";
import { nowIso } from "@/lib/integrations/time";
import { IntegrationCard } from "./_components/integration-card";
import { PasteImport } from "./_components/paste-import";
import "@/styles/integrations.css";

export const dynamic = "force-dynamic";

export default function IntegrationsPage() {
  const db = getDb();
  const now = nowIso();
  const rows = listIntegrations(db, now);

  return (
    <Page
      kicker="System"
      title="Integrations"
      lede="What reports into Track, what each one reads and sends, and what you have allowed. Nothing is fetched from GitHub or elsewhere by the server."
    >
      <Panel title="Privacy, in short" description="These rules apply to every integration.">
        <ul className="int-rules">
          <li>Transcripts and message text are never read by the server and never stored.</li>
          <li>Summaries are off by default. You can turn them on per tool; turning them off clears what was kept.</li>
          <li>A Connected status means a report arrived in the last day. After that it shows as Stale.</li>
          <li>Connector reports need a token from Settings with the matching scope. Revoke it there to cut access.</li>
        </ul>
      </Panel>

      <section className="int-grid" aria-label="Integrations">
        {rows.map((row) => (
          <IntegrationCard key={row.key} row={row} runs={recentRuns(db, row.key, 5)} />
        ))}
      </section>

      <Panel title="Paste by hand" description="For reports you copied from a file. The same validation applies as to the connector.">
        <PasteImport kind="sessions" />
        <PasteImport kind="repo-events" />
      </Panel>
    </Page>
  );
}
