import Link from "next/link";
import { Page, Panel } from "@/components/track/page";
import { addDays, isoDate, shortDay, todayStr } from "@/lib/dates";
import { TIMELINE_CATEGORIES, getTimeline } from "@/lib/timeline";
import "@/styles/timeline.css";

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function TimelinePage({ searchParams }: { searchParams: Params }) {
  const p = await searchParams;
  const today = todayStr();
  const to = isoDate(one(p.to)) ? one(p.to) : today;
  const from = isoDate(one(p.from)) ? one(p.from) : addDays(to, -29);
  const q = one(p.q).slice(0, 80);
  const cat = TIMELINE_CATEGORIES.find((c) => c === one(p.cat));
  const { events, truncated } = getTimeline({ from, to, q, categories: cat ? [cat] : undefined });

  const byDay = new Map<string, typeof events>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  return (
    <Page
      kicker="Timeline"
      title="Life timeline"
      lede="Everything you recorded, merged from the other modules. Nothing here is stored twice or inferred."
    >
      <Panel title="Filter">
        <form className="tl-filter" method="get" role="search">
          <label>
            From <input type="date" name="from" defaultValue={from} />
          </label>
          <label>
            To <input type="date" name="to" defaultValue={to} />
          </label>
          <label>
            Category
            <select name="cat" defaultValue={cat ?? ""}>
              <option value="">All</option>
              {TIMELINE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Search <input type="search" name="q" defaultValue={q} maxLength={80} />
          </label>
          <button type="submit" className="tk-button">Apply</button>
        </form>
      </Panel>
      <Panel
        title={`${events.length} event${events.length === 1 ? "" : "s"}`}
        description={`${shortDay(from)} to ${shortDay(to)}`}
      >
        {events.length === 0 ? (
          <p className="tk-empty">Nothing recorded in this range.</p>
        ) : (
          <ol className="tl-days">
            {[...byDay].map(([date, items]) => (
              <li key={date}>
                <h3>{shortDay(date)}</h3>
                <ul className="tl-events">
                  {items.map((e) => (
                    <li key={e.id} data-category={e.category}>
                      <b>{e.category}</b>
                      <Link href={e.href}>{e.title}</Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
        {truncated ? (
          <p className="tk-widget-foot">Showing the newest events. Narrow the date range to see more.</p>
        ) : null}
      </Panel>
    </Page>
  );
}
