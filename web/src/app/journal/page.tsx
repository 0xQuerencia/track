import "@/styles/journal.css";
import Link from "next/link";
import { TrendChart, PALETTE } from "@/components/track/charts";
import { Page, Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { todayStr } from "@/lib/dates";
import { entriesBetween, allJournalTags, listJournal } from "@/lib/journal/entries";
import { reflectionRange, summarizeEntries, tagFrequency, type ReflectionView } from "@/lib/journal/reflect";
import { journalSeries } from "@/lib/queries";
import { EntriesTable } from "./_components/entries-table";
import { JournalComposer } from "./_components/journal-composer";

export const dynamic = "force-dynamic";

const MAX_Q = 80;
const MAX_TAG = 40;

type Params = { view?: string | string[]; q?: string | string[]; tag?: string | string[] };
const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** Keeps the view and filters when a link changes only one of them. */
function hrefFor(view: ReflectionView, q: string, tag: string, patch: { view?: ReflectionView; tag?: string | null }): string {
  const params = new URLSearchParams();
  params.set("view", patch.view ?? view);
  const nextTag = patch.tag === undefined ? tag : patch.tag;
  if (q) params.set("q", q);
  if (nextTag) params.set("tag", nextTag);
  return `/journal?${params.toString()}`;
}

export default async function JournalPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const view: ReflectionView = first(params.view) === "month" ? "month" : "week";
  const q = (first(params.q) ?? "").trim().slice(0, MAX_Q);
  const tag = (first(params.tag) ?? "").trim().slice(0, MAX_TAG);

  const today = todayStr();
  const range = reflectionRange(view, today);
  const summary = summarizeEntries(entriesBetween(range.start, range.end));
  const entries = listJournal({ q, tag });
  const tagHints = allJournalTags();
  const topTags = tagFrequency(entriesBetween(range.start, range.end), 8);

  return (
    <Page
      kicker="Journal"
      title="Journal"
      lede="A few lines a day: what went well, what did not, and how you felt."
    >
      <nav className="tk-chips journal-views" aria-label="Reflection period">
        <Link href={hrefFor("week", q, tag, { view: "week" })} className="tk-chip" aria-current={view === "week" ? "page" : undefined}>
          Week
        </Link>
        <Link href={hrefFor("month", q, tag, { view: "month" })} className="tk-chip" aria-current={view === "month" ? "page" : undefined}>
          Month
        </Link>
      </nav>
      <Panel title={`Reflection · ${range.label}`} description={`${range.start} to ${range.end}. Counts and averages of what you recorded.`}>
        <p className="tk-callout">
          {summary.entries === 0
            ? "No entries in this period yet."
            : `${summary.entries} ${summary.entries === 1 ? "entry" : "entries"} on ${summary.daysWithEntries} ${summary.daysWithEntries === 1 ? "day" : "days"}, ${summary.wins} with a win noted. Average mood ${summary.moodAverage ?? "n/a"}/5, energy ${summary.energyAverage ?? "n/a"}/5.`}
        </p>
        <StatGrid>
          <StatCard label="Entries" value={summary.entries} />
          <StatCard label="Days with entries" value={summary.daysWithEntries} />
          <StatCard label="Wins noted" value={summary.wins} />
          <StatCard label="Average mood" value={summary.moodAverage} decimals={1} suffix="/5" />
          <StatCard label="Average energy" value={summary.energyAverage} decimals={1} suffix="/5" />
        </StatGrid>
        {topTags.length > 0 ? (
          <ul className="journal-tag-counts" aria-label="Most used tags in this period">
            {topTags.map((item) => (
              <li key={item.tag}>
                <Link href={hrefFor(view, q, tag, { tag: item.tag })}>{item.tag}</Link>
                <small>{item.count}</small>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
      <SplitPanels>
        <Panel title="Mood, 14 days">
          <TrendChart data={journalSeries("mood", 14)} color={PALETTE[3]} />
        </Panel>
        <Panel title="Energy, 14 days">
          <TrendChart data={journalSeries("energy", 14)} color={PALETTE[2]} />
        </Panel>
      </SplitPanels>
      <Panel title="Write" description="A new entry. Drafts are kept in this browser until you save.">
        <details className="tk-add" open={summary.entries === 0 && !q && !tag}>
          <summary>New entry</summary>
          <JournalComposer mode="create" defaultDate={today} tagHints={tagHints} />
        </details>
      </Panel>
      <Panel title="Entries" description={q || tag ? `Filtered${tag ? ` to tag “${tag}”` : ""}${q ? ` by “${q}”` : ""}.` : "Newest first."}>
        <form action="/journal" method="get" className="journal-search" role="search">
          <input type="hidden" name="view" value={view} />
          {tag ? <input type="hidden" name="tag" value={tag} /> : null}
          <label className="tk-field">
            <span>Search</span>
            <input type="search" name="q" defaultValue={q} maxLength={MAX_Q} placeholder="Title, tags or text" />
          </label>
          <button type="submit" className="tk-button tk-primary">Search</button>
          {q || tag ? (
            <Link href={`/journal?view=${view}`} className="tk-button tk-ghost">
              Clear
            </Link>
          ) : null}
        </form>
        {entries.length === 0 ? (
          <p className="tk-empty">
            {q || tag ? "No entries match these filters." : "No entries yet. Write the first one above."}
          </p>
        ) : (
          <EntriesTable entries={entries} />
        )}
      </Panel>
    </Page>
  );
}
