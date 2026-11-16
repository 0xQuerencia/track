import Link from "next/link";
import { calendarHref, type CalendarQuery } from "@/lib/calendar/url";
import { formatLongDate, formatShortDate, type CalendarItem } from "@/lib/calendar/model";
import { ItemRow } from "./item-row";

/** Items for one day, with an add link that opens the editor on that date. */
export function DayAgenda({
  date,
  items,
  query,
  heading,
}: {
  date: string;
  items: CalendarItem[];
  query: CalendarQuery;
  heading?: string;
}) {
  return (
    <section className="cal-agenda" aria-labelledby={`agenda-${date}`}>
      <header className="cal-agenda-head">
        <h3 id={`agenda-${date}`}>{heading ?? formatLongDate(date)}</h3>
        <Link
          href={calendarHref(query, { date, isNew: true, event: null })}
          prefetch={false}
          className="tk-button tk-ghost"
        >
          Add to this day
        </Link>
      </header>
      {items.length ? (
        <ul className="cal-list">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} query={query} />
          ))}
        </ul>
      ) : (
        <p className="tk-empty">Nothing on this day{query.categories.length || query.sources.length ? " with these filters" : ""}.</p>
      )}
    </section>
  );
}

/** Seven day columns for the week view. Columns stack on narrow screens. */
export function WeekColumns({
  days,
  query,
}: {
  days: { date: string; items: CalendarItem[]; isToday: boolean }[];
  query: CalendarQuery;
}) {
  return (
    <div className="cal-week" role="list" aria-label="Week">
      {days.map((day) => (
        <section
          key={day.date}
          role="listitem"
          className="cal-week-day"
          data-today={day.isToday || undefined}
          aria-label={formatLongDate(day.date)}
        >
          <header className="cal-week-head">
            <Link href={calendarHref(query, { view: "day", date: day.date, event: null, isNew: false })} prefetch={false}>
              {formatShortDate(day.date)}
            </Link>
            <span>{formatLongDate(day.date).split(",")[0]}</span>
          </header>
          {day.items.length ? (
            <ul className="cal-list">
              {day.items.map((item) => (
                <ItemRow key={`${day.date}-${item.id}`} item={item} query={query} />
              ))}
            </ul>
          ) : (
            <p className="cal-week-empty">Free</p>
          )}
        </section>
      ))}
    </div>
  );
}

/** Upcoming items grouped by day. */
export function UpcomingList({
  groups,
  query,
}: {
  groups: { date: string; items: CalendarItem[] }[];
  query: CalendarQuery;
}) {
  if (!groups.length) {
    return <p className="tk-empty">Nothing scheduled in the next 30 days.</p>;
  }
  return (
    <div className="cal-upcoming">
      {groups.map((group) => (
        <section key={group.date} className="cal-upcoming-day" aria-labelledby={`up-${group.date}`}>
          <h3 id={`up-${group.date}`}>{formatLongDate(group.date)}</h3>
          <ul className="cal-list">
            {group.items.map((item) => (
              <ItemRow key={item.id} item={item} query={query} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
