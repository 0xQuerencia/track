import { BarsChart, PALETTE, TrendChart } from "@/components/track/charts";
import { Panel, SplitPanels } from "@/components/track/page";
import { shortDay, todayStr } from "@/lib/dates";
import { monthlySeries } from "@/lib/health/trends";
import { healthSeries } from "@/lib/queries";

/** Sleep and energy trends from the existing daily log, weekly and monthly. */
export function SleepTab() {
  const today = todayStr();
  const monthly = monthlySeries("sleep_hours", 6, today);
  const monthlyEnergy = monthlySeries("energy", 6, today);
  return (
    <>
      <SplitPanels>
        <Panel title="Sleep, two weeks" description="Hours per night, from the daily log.">
          <TrendChart data={healthSeries("sleep_hours", 14)} emptyNote="Log sleep to see the trend." />
        </Panel>
        <Panel title="Energy, two weeks" description="1 is drained, 5 is sharp.">
          <TrendChart data={healthSeries("energy", 14)} color={PALETTE[2]} emptyNote="Log energy to see the trend." />
        </Panel>
      </SplitPanels>
      <SplitPanels>
        <Panel title="Sleep, six months" description="Monthly averages of logged nights.">
          <BarsChart
            data={monthly.map((point) => ({ name: shortDay(point.date).replace(/ \d+$/, ""), hours: point.value }))}
            series={[{ key: "hours", color: PALETTE[0] }]}
            emptyNote="Monthly averages appear once there are logged nights."
          />
        </Panel>
        <Panel title="Energy, six months" description="Monthly averages of logged energy.">
          <BarsChart
            data={monthlyEnergy.map((point) => ({ name: shortDay(point.date).replace(/ \d+$/, ""), energy: point.value }))}
            series={[{ key: "energy", color: PALETTE[2] }]}
            emptyNote="Monthly averages appear once there is logged energy."
          />
        </Panel>
      </SplitPanels>
    </>
  );
}
