import Link from "next/link";
import { Page, Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { OPPORTUNITY_KINDS, OPPORTUNITY_STATUSES } from "@/lib/career/constants";
import { careerHref, parseCareerParams } from "@/lib/career/params";
import {
  boardOpportunities,
  listOpportunities,
  opportunityStats,
  recentMilestones,
} from "@/lib/career/queries";
import { DEADLINE_WINDOWS } from "@/lib/career/deadlines";
import { shortDay, todayStr } from "@/lib/dates";
import { createOpportunityAction } from "./actions";
import { OpportunityBoard, OpportunityList } from "./_components/opportunity-views";
import { OpportunityForm } from "./_components/opportunity-form";
import "@/styles/career.css";

export const dynamic = "force-dynamic";

const WINDOW_LABELS: Record<string, string> = {
  all: "Any deadline",
  overdue: "Overdue",
  next7: "Next 7 days",
  next30: "Next 30 days",
  next90: "Next 90 days",
  none: "No deadline",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CareerPage({ searchParams }: { searchParams: SearchParams }) {
  const params = parseCareerParams(await searchParams);
  const today = todayStr();
  const stats = opportunityStats(today);
  const milestones = recentMilestones(8);

  const list =
    params.view === "list"
      ? listOpportunities(params.filters, params.page, today)
      : null;
  const board =
    params.view === "board"
      ? boardOpportunities({ kind: params.filters.kind, window: params.filters.window }, today)
      : null;

  return (
    <Page
      kicker="Career"
      title="Career"
      lede="Applications, scholarships, competitions and the milestones you have reached. Deadlines also appear on the calendar."
    >
      <StatGrid>
        <StatCard label="Open" value={stats.open} hint={`of ${stats.total} tracked`} />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          tone={stats.overdue > 0 ? "negative" : undefined}
          hint="Not yet applied"
        />
        <StatCard label="Due in 30 days" value={stats.dueWithin30} />
        <StatCard label="Accepted" value={stats.accepted} tone={stats.accepted > 0 ? "positive" : undefined} />
        <StatCard label="Milestones" value={stats.milestones} hint="Achievements and portfolio" />
      </StatGrid>

      <section className="tk-panel career-toolbar" aria-label="Filters">
        <form method="get" action="/career" className="career-filters">
          <label className="career-field">
            <span>Kind</span>
            <select name="kind" defaultValue={params.filters.kind ?? ""}>
              <option value="">All kinds</option>
              {OPPORTUNITY_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
          <label className="career-field">
            <span>Status</span>
            <select name="status" defaultValue={params.filters.status ?? ""}>
              <option value="">All statuses</option>
              {OPPORTUNITY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="career-field">
            <span>Deadline</span>
            <select name="window" defaultValue={params.filters.window}>
              {DEADLINE_WINDOWS.map((window) => (
                <option key={window} value={window}>
                  {WINDOW_LABELS[window]}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="view" value={params.view} />
          <button type="submit" className="tk-button tk-ghost">
            Apply
          </button>
        </form>
        <nav className="career-views" aria-label="View">
          <Link
            href={careerHref(params, { view: "list", page: 1 })}
            aria-current={params.view === "list" ? "page" : undefined}
          >
            List
          </Link>
          <Link
            href={careerHref(params, { view: "board", page: 1 })}
            aria-current={params.view === "board" ? "page" : undefined}
          >
            By status
          </Link>
        </nav>
      </section>

      {list ? (
        <section className="tk-panel" aria-label="Opportunities">
          <header className="tk-panel-head">
            <div>
              <h2>Opportunities</h2>
              <p>Soonest deadline first. Items without a deadline come last.</p>
            </div>
            <span className="tk-count">{list.total}</span>
          </header>
          {list.rows.length === 0 ? (
            <p className="tk-empty">No opportunities match these filters.</p>
          ) : (
            <OpportunityList rows={list.rows} today={today} />
          )}
          {list.pageCount > 1 ? (
            <nav className="career-pager" aria-label="Pages">
              {list.page > 1 ? (
                <Link href={careerHref(params, { page: list.page - 1 })}>Previous</Link>
              ) : (
                <span className="career-muted">Previous</span>
              )}
              <span className="career-muted">
                Page {list.page} of {list.pageCount}
              </span>
              {list.page < list.pageCount ? (
                <Link href={careerHref(params, { page: list.page + 1 })}>Next</Link>
              ) : (
                <span className="career-muted">Next</span>
              )}
            </nav>
          ) : null}
        </section>
      ) : null}

      {board ? (
        <section className="tk-panel" aria-label="Opportunities by status">
          <header className="tk-panel-head">
            <div>
              <h2>By status</h2>
              <p>Move a card by changing its status. Every change is kept in its history.</p>
            </div>
            <span className="tk-count">{board.rows.length}</span>
          </header>
          <OpportunityBoard rows={board.rows} today={today} truncated={board.truncated} />
        </section>
      ) : null}

      <SplitPanels>
        <Panel title="Add an opportunity" description="Deadlines you enter here show on the calendar.">
          <OpportunityForm
            action={createOpportunityAction}
            submitLabel="Add opportunity"
            resetOnSuccess
          />
        </Panel>
        <Panel
          title="Milestones"
          description="Achievements and portfolio pieces with a date."
        >
          {milestones.length === 0 ? (
            <p className="tk-empty">
              Add an opportunity with the kind Achievement or Portfolio and an achieved date.
            </p>
          ) : (
            <ul className="career-milestones">
              {milestones.map((item) => (
                <li key={item.id}>
                  <time dateTime={item.achieved_on ?? undefined}>
                    {item.achieved_on ? shortDay(item.achieved_on) : ""}
                  </time>
                  <Link href={`/career/${item.id}`}>{item.title}</Link>
                  <small>{item.kind}</small>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </SplitPanels>
    </Page>
  );
}
