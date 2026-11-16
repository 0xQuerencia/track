import Link from "next/link";
import { Page, Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { addDays, todayStr } from "@/lib/dates";
import { getUpcomingImportantDates } from "@/lib/people";
import {
  cleanTerm,
  listImportantDates,
  listPeople,
  personOptions,
  PEOPLE_PAGE_SIZE,
} from "@/lib/people/queries";
import { createImportantDateAction, createPersonAction } from "./actions";
import { DateEditors, PeopleTable, UpcomingDates } from "./_components/people-views";
import { ImportantDateForm } from "./_components/date-form";
import { PersonForm } from "./_components/person-form";
import "@/styles/people.css";

export const dynamic = "force-dynamic";

const UPCOMING_DAYS = 60;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? "";

export default async function PeoplePage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const q = cleanTerm(first(raw.q));
  const tag = cleanTerm(first(raw.tag), 40);
  const pageNumber = Number.parseInt(first(raw.page), 10);
  const today = todayStr();
  const upcoming = getUpcomingImportantDates(today, addDays(today, UPCOMING_DAYS));
  const people = listPeople({ q, tag }, Number.isFinite(pageNumber) ? pageNumber : 1);
  const dates = listImportantDates();
  const options = personOptions();

  const pageHref = (target: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (tag) query.set("tag", tag);
    if (target > 1) query.set("page", String(target));
    const text = query.toString();
    return text ? `/people?${text}` : "/people";
  };

  return (
    <Page
      kicker="People"
      title="People"
      lede="The people you want to remember: a name, how you know them, and the dates that matter. Nothing here is synced from other accounts."
    >
      <StatGrid>
        <StatCard label="People" value={people.total} hint={q || tag ? "matching" : "saved"} />
        <StatCard label="Next 60 days" value={upcoming.length} hint="Birthdays and dates" />
        <StatCard label="Important dates" value={dates.length} />
      </StatGrid>

      <SplitPanels>
        <Panel title="Coming up" description={`Birthdays and dates in the next ${UPCOMING_DAYS} days.`}>
          <UpcomingDates items={upcoming} />
        </Panel>
        <Panel title="Add a person" description="Only what you choose to enter is stored.">
          <PersonForm action={createPersonAction} submitLabel="Add person" resetOnSuccess />
        </Panel>
      </SplitPanels>

      <section className="tk-panel" aria-label="People">
        <header className="tk-panel-head">
          <div>
            <h2>People</h2>
            <p>Search by name, relationship, notes or tag.</p>
          </div>
          <span className="tk-count">{people.total}</span>
        </header>
        <form method="get" action="/people" className="people-search" role="search">
          <label className="people-field">
            <span>Search</span>
            <input type="search" name="q" maxLength={80} defaultValue={q} />
          </label>
          <label className="people-field">
            <span>Tag</span>
            <input type="text" name="tag" maxLength={40} defaultValue={tag} />
          </label>
          <button type="submit" className="tk-button tk-ghost">
            Search
          </button>
          {q || tag ? <Link href="/people">Clear</Link> : null}
        </form>
        {people.rows.length === 0 ? (
          <p className="tk-empty">
            {q || tag ? "No one matches that search." : "No people saved yet."}
          </p>
        ) : (
          <PeopleTable rows={people.rows} tag={tag} />
        )}
        {people.pageCount > 1 ? (
          <nav className="people-pager" aria-label="Pages">
            {people.page > 1 ? <Link href={pageHref(people.page - 1)}>Previous</Link> : <span />}
            <span className="people-muted">
              Page {people.page} of {people.pageCount} · {PEOPLE_PAGE_SIZE} per page
            </span>
            {people.page < people.pageCount ? (
              <Link href={pageHref(people.page + 1)}>Next</Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>

      <section className="tk-panel" aria-label="Important dates">
        <header className="tk-panel-head">
          <div>
            <h2>Important dates</h2>
            <p>Yearly dates repeat on their day. February 29 falls on February 28 in other years.</p>
          </div>
          <span className="tk-count">{dates.length}</span>
        </header>
        <details className="tk-add" open={dates.length === 0}>
          <summary>Add an important date</summary>
          <ImportantDateForm
            action={createImportantDateAction}
            people={options}
            submitLabel="Add date"
            resetOnSuccess
          />
        </details>
        {dates.length === 0 ? (
          <p className="tk-empty">No important dates yet.</p>
        ) : (
          <DateEditors rows={dates} people={options} />
        )}
      </section>
    </Page>
  );
}
