import { EntityPanel } from "@/components/track/entity-panel";
import { TrendChart, PALETTE } from "@/components/track/charts";
import { Page, Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { listRows } from "@/lib/crud";
import { journalAverages, journalSeries } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function JournalPage() {
  const week = journalAverages(7);

  return (
    <Page
      kicker="Journal"
      title="Journal"
      lede="A few lines a day: what went well, what did not, and how you felt."
    >
      <Panel title="Weekly summary" description="The last seven days.">
        <p className="tk-callout">
          {week.entries === 0
            ? "No entries this week yet."
            : `${week.entries} ${week.entries === 1 ? "entry" : "entries"}, ${week.wins} with a win noted. Average mood ${week.mood ?? "n/a"}/5, energy ${week.energy ?? "n/a"}/5.`}
        </p>
      </Panel>
      <StatGrid>
        <StatCard label="Entries, 7 days" value={week.entries} />
        <StatCard label="Wins noted" value={week.wins} />
        <StatCard label="Average mood" value={week.mood} decimals={1} suffix="/5" />
        <StatCard label="Average energy" value={week.energy} decimals={1} suffix="/5" />
      </StatGrid>
      <SplitPanels>
        <Panel title="Mood, 14 days">
          <TrendChart data={journalSeries("mood", 14)} color={PALETTE[3]} />
        </Panel>
        <Panel title="Energy, 14 days">
          <TrendChart data={journalSeries("energy", 14)} color={PALETTE[2]} />
        </Panel>
      </SplitPanels>
      <EntityPanel
        entityKey="journal_entries"
        title="Entries"
        rows={listRows("journal_entries")}
        columns={[
          { name: "date" },
          { name: "mood" },
          { name: "energy" },
          { name: "win" },
          { name: "setback" },
          { name: "text", label: "Reflection" },
        ]}
      />
    </Page>
  );
}
