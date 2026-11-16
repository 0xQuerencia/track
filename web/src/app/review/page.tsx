import Link from "next/link";
import { Page, Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { getUpcomingItems } from "@/lib/calendar/aggregate";
import { isoDate, shortDay, todayStr } from "@/lib/dates";
import { PatternsPanel } from "./patterns-panel";
import { getReview, reviewRange, shiftAnchor, type ReviewPeriod } from "@/lib/review";

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const PERIODS: ReviewPeriod[] = ["day", "week", "month"];

export default async function ReviewPage({ searchParams }: { searchParams: Params }) {
  const p = await searchParams;
  const period = PERIODS.find((x) => x === one(p.period)) ?? "week";
  const anchor = isoDate(one(p.date)) ? one(p.date) : todayStr();
  const r = getReview(period, anchor);
  const { from, to } = reviewRange(period, anchor);
  const link = (per: ReviewPeriod, date: string) => `/review?period=${per}&date=${date}`;
  const accuracy = r.questions > 0 ? Math.round((r.correct / r.questions) * 100) : null;
  const upcoming = getUpcomingItems(7).slice(0, 8);
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const habitRate = r.habitCount > 0 ? Math.round((r.habitCheckIns / (r.habitCount * days)) * 100) : null;

  return (
    <Page
      kicker="Review"
      title={`${period[0].toUpperCase()}${period.slice(1)} review`}
      lede={`${shortDay(from)}${from === to ? "" : ` to ${shortDay(to)}`}. Counts and sums from your records only: no scores, no estimates.`}
    >
      <nav aria-label="Review period" className="tl-filter">
        {PERIODS.map((x) => (
          <Link key={x} className="tk-button tk-ghost" aria-current={x === period ? "page" : undefined} href={link(x, anchor)}>
            {x}
          </Link>
        ))}
        <Link className="tk-button tk-ghost" href={link(period, shiftAnchor(period, anchor, -1))}>Previous</Link>
        <Link className="tk-button tk-ghost" href={link(period, shiftAnchor(period, anchor, 1))}>Next</Link>
      </nav>
      <StatGrid>
        <StatCard label="Tasks completed" value={r.tasksCompleted} />
        <StatCard label="Study minutes" value={r.studyMinutes} />
        <StatCard label="Focus minutes" value={r.focusMinutes} />
        <StatCard label="Revisions" value={r.revisions} />
        <StatCard label="Question accuracy" value={accuracy} suffix="%" hint={r.questions ? `${r.correct}/${r.questions}` : "No questions logged"} />
        <StatCard label="Workouts" value={r.workouts} />
      </StatGrid>
      <PatternsPanel />
      <SplitPanels>
        <Panel title="Academics">
          {r.mocks.length === 0 ? (
            <p className="tk-empty">No mock tests in this period.</p>
          ) : (
            <ul className="tk-list">
              {r.mocks.map((m) => (
                <li key={`${m.date}-${m.name}`}>
                  <span>{m.name}</span>
                  <small>{m.scored ?? "?"}/{m.total ?? "?"}</small>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Building">
          <ul className="tk-list">
            <li><span>AI sessions active</span><small>{r.aiSessionsActive}</small></li>
            <li><span>Milestones completed</span><small>{r.milestonesDone}</small></li>
            <li><span>Ideas captured</span><small>{r.ideasCaptured}</small></li>
            <li><span>Notes created</span><small>{r.notesCreated}</small></li>
          </ul>
        </Panel>
        <Panel title="Life">
          <ul className="tk-list">
            <li><span>Habit check-ins</span><small>{r.habitCheckIns}{habitRate !== null ? ` · about ${Math.min(habitRate, 100)}% of possible` : ""}</small></li>
            <li><span>Journal entries</span><small>{r.journalEntries}{r.averageMood !== null ? ` · mood ${r.averageMood}` : ""}</small></li>
            <li><span>Goals reviewed</span><small>{r.goalsReviewed}</small></li>
            <li><span>Overdue tasks right now</span><small>{r.tasksOverdueNow}</small></li>
          </ul>
        </Panel>
        <Panel title="Money">
          <ul className="tk-list">
            <li><span>Income</span><small>{r.income}</small></li>
            <li><span>Expenses</span><small>{r.expenses}</small></li>
            <li><span>Net</span><small>{r.income - r.expenses}</small></li>
          </ul>
        </Panel>
      </SplitPanels>
      <Panel title="Coming up (next 7 days)">
        {upcoming.length === 0 ? (
          <p className="tk-empty">Nothing dated in the next week.</p>
        ) : (
          <ul className="tk-list">
            {upcoming.map((i) => (
              <li key={i.id}>
                <Link href={i.href}>{i.title}</Link>
                <small>{shortDay(i.date)}</small>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Page>
  );
}
