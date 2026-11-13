import { BarsChart, Donut } from "@/components/track/charts";
import { EntityPanel } from "@/components/track/entity-panel";
import { FocusTimer } from "@/components/track/focus-timer";
import { Page, Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { listRows } from "@/lib/crud";
import { shortDay } from "@/lib/dates";
import { focusMinutesByDay, focusTotals, screenByCategory } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function FocusPage() {
  const today = focusTotals(1);
  const week = focusTotals(7);
  const perDay = focusMinutesByDay(14).map((p) => ({
    name: shortDay(p.date),
    minutes: p.value,
  }));

  return (
    <Page
      kicker="Focus"
      title="Focus"
      lede="Time you protected for real work, and where the rest of the screen time went."
    >
      <Panel title="Timer" description="Stopping the timer saves the session automatically.">
        <FocusTimer />
      </Panel>
      <StatGrid>
        <StatCard label="Focused today" value={today.minutes} suffix=" min" />
        <StatCard label="Focused, 7 days" value={week.minutes} suffix=" min" />
        <StatCard label="Sessions, 7 days" value={week.sessions} />
        <StatCard label="Distractions, 7 days" value={week.distractions} />
      </StatGrid>
      <SplitPanels>
        <Panel title="Focus minutes, 14 days">
          <BarsChart data={perDay} series={[{ key: "minutes" }]} emptyNote="Run the timer to see focus minutes." />
        </Panel>
        <Panel
          title="Screen time, 7 days"
          description="Entered by hand for now. Automatic tracking needs the desktop companion, which is not built yet."
        >
          <Donut data={screenByCategory(7)} centerLabel="Minutes" emptyNote="Log screen time to see the split." />
        </Panel>
      </SplitPanels>
      <EntityPanel
        entityKey="focus_sessions"
        title="Focus sessions"
        rows={listRows("focus_sessions")}
      />
      <EntityPanel
        entityKey="screen_logs"
        title="Screen time log"
        rows={listRows("screen_logs")}
      />
    </Page>
  );
}
