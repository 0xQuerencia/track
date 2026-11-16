import { BarsChart, PALETTE } from "@/components/track/charts";
import { EntityPanel } from "@/components/track/entity-panel";
import { Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { listRows } from "@/lib/crud";
import { shortDay, todayStr } from "@/lib/dates";
import { hydrationOn } from "@/lib/health/aggregates";
import { hydrationByDay } from "@/lib/health/trends";
import { healthAverages, healthSeries } from "@/lib/queries";

/** Water: millilitre entries, daily totals, and the litres kept in the daily log. */
export function HydrationTab() {
  const today = todayStr();
  const avg = healthAverages(7);
  const days = hydrationByDay(14, today);
  const litres = healthSeries("water_l", 14).map((p) => ({ name: shortDay(p.date), litres: p.value }));
  return (
    <>
      <StatGrid>
        <StatCard label="Today" value={hydrationOn(today)} suffix=" ml" hint="from hydration entries" />
        <StatCard label="Daily log, 7-day avg" value={avg.water} decimals={1} suffix=" L" hint="from the daily log" />
      </StatGrid>
      <SplitPanels>
        <Panel title="Daily totals, two weeks" description="Millilitres logged per day.">
          <BarsChart
            data={days.map((day) => ({ name: day.name, ml: day.ml }))}
            series={[{ key: "ml", color: PALETTE[1] }]}
            emptyNote="Log water to see daily totals."
          />
        </Panel>
        <Panel title="Daily log, two weeks" description="Litres from the daily log.">
          <BarsChart
            data={litres}
            series={[{ key: "litres", color: PALETTE[3] }]}
            emptyNote="Log water to see the chart."
          />
        </Panel>
      </SplitPanels>
      <EntityPanel
        entityKey="hydration_logs"
        title="Water entries"
        description="Add each drink as it happens. Totals per day come from these entries."
        rows={listRows("hydration_logs")}
        columns={[{ name: "date" }, { name: "ml" }]}
      />
    </>
  );
}
