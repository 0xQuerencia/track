import Link from "next/link";
import { BarsChart, Donut } from "@/components/track/charts";
import { EntityPanel } from "@/components/track/entity-panel";
import { FocusTimer } from "@/components/track/focus-timer";
import { Page, Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { listRows } from "@/lib/crud";
import { getDb } from "@/lib/db";
import { recentCompletedSessions, unassignedSeconds } from "@/lib/study-nanny/sessions";
import { shortDay } from "@/lib/dates";
import { focusMinutesByDay, focusTotals, screenByCategory } from "@/lib/queries";

export const dynamic = "force-dynamic";

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const sessionTime = new Intl.DateTimeFormat("en", {
  dateStyle: "medium", timeStyle: "short", timeZone: process.env.TRACK_TZ ?? "UTC",
});

export default function FocusPage() {
  const nanny = recentCompletedSessions(getDb());
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
      <Panel title="Lock-In" description="Synchronized, recoverable focus and Pomodoro sessions."><Link className="tk-button tk-primary" href="/lock-in">Open Lock-In</Link></Panel>
      <Panel title="Legacy timer" description="Finish an existing local timer here before starting a new Lock-In session.">
        <FocusTimer />
      </Panel>
      <Panel
        title="Study Nanny"
        description="Completed desktop sessions only. Measured focus is separate from your Track timer and is not added to it."
      >
        {nanny.length === 0 ? <p>No Study Nanny sessions imported yet.</p> : (
          <ul>
            {nanny.map((session, index) => (
              <li key={`${session.ended_at}-${session.session_id}-${index}`}>
                <time dateTime={session.ended_at}>{sessionTime.format(new Date(session.ended_at))}</time>
                {" · "}{formatDuration(session.focus_seconds)} verified focus
                {" · "}{formatDuration(session.distraction_seconds)} distracted
                {" · "}{formatDuration(session.idle_seconds)} idle
                {" · "}{formatDuration(session.break_seconds)} break
                {" · "}{formatDuration(unassignedSeconds(session))} unverified / gaps
                {" · "}{formatDuration(session.elapsed_seconds)} elapsed excluding gaps
              </li>
            ))}
          </ul>
        )}
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
