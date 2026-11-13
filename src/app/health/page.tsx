import { BarsChart, PALETTE, TrendChart } from "@/components/track/charts";
import { EntityPanel } from "@/components/track/entity-panel";
import { Page, Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { listRows } from "@/lib/crud";
import { shortDay } from "@/lib/dates";
import { healthAverages, healthSeries } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function HealthPage() {
  const avg = healthAverages(7);
  const water = healthSeries("water_l", 14).map((p) => ({
    name: shortDay(p.date),
    litres: p.value,
  }));

  return (
    <Page
      kicker="Health"
      title="Health"
      lede="Sleep, energy, hydration and training. A quick daily log is enough."
    >
      <StatGrid>
        <StatCard label="Sleep, 7-day avg" value={avg.sleep} decimals={1} suffix=" h" />
        <StatCard label="Energy, 7-day avg" value={avg.energy} decimals={1} suffix="/5" />
        <StatCard label="Water, 7-day avg" value={avg.water} decimals={1} suffix=" L" />
      </StatGrid>
      <SplitPanels>
        <Panel title="Sleep, 14 days" description="Hours per night.">
          <TrendChart data={healthSeries("sleep_hours", 14)} />
        </Panel>
        <Panel title="Energy, 14 days" description="1 is drained, 5 is sharp.">
          <TrendChart data={healthSeries("energy", 14)} color={PALETTE[2]} />
        </Panel>
      </SplitPanels>
      <Panel title="Water, 14 days" description="Litres per day.">
        <BarsChart
          data={water}
          series={[{ key: "litres", color: PALETTE[1] }]}
          emptyNote="Log water to see the chart."
        />
      </Panel>
      <EntityPanel
        entityKey="health_logs"
        title="Daily log"
        rows={listRows("health_logs")}
        columns={[
          { name: "date" },
          { name: "sleep_hours" },
          { name: "energy" },
          { name: "water_l" },
          { name: "workout" },
          { name: "meals" },
          { name: "notes" },
        ]}
      />
    </Page>
  );
}
