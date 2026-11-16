import "@/styles/calendar.css";
import Link from "next/link";
import { Page } from "@/components/track/page";
import { getCalendarItems } from "@/lib/calendar/aggregate";
import { getEventRow } from "@/lib/calendar/events";
import { eventFormValues, blankEventFormValues } from "@/lib/calendar/form-values";
import { categoriesOf, itemsByDay } from "@/lib/calendar/grid";
import { getUpcomingReminders } from "@/lib/calendar/reminders";
import {
  UPCOMING_DAYS,
  formatLongDate,
  formatShortDate,
  type CalendarItem,
} from "@/lib/calendar/model";
import { calendarTimeZone, monthGridDays, todayIn, addDays, startOfMonth } from "@/lib/calendar/time";
import {
  calendarHref,
  listSearch,
  parseCalendarQuery,
  rangeForView,
  shiftDate,
  type CalendarQuery,
} from "@/lib/calendar/url";
import { CalendarToolbar, FilterBar } from "./_components/chrome";
import { DayAgenda, UpcomingList, WeekColumns } from "./_components/agenda";
import { EventForm } from "./_components/event-form";
import { MonthGrid, type GridDay } from "./_components/month-grid";
import { RemindersPanel } from "./_components/reminders-panel";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const now = new Date();
  const zone = calendarTimeZone();
  const today = todayIn(zone, now);
  const query = parseCalendarQuery(await searchParams, today);
  const range = rangeForView(query.view, query.date, today);
  const items = getCalendarItems(
    range.from,
    range.to,
    { categories: query.categories, sources: query.sources },
    { now, zone },
  );
  const byDay = itemsByDay(items, range.from, range.to);
  const reminders = getUpcomingReminders(now, { zone });

  const editing = query.event !== null ? getEventRow(query.event) : undefined;
  const missingEvent = query.event !== null && editing === undefined;
  const formOpen = editing !== undefined || query.isNew;
  const formKey = editing ? `event-${editing.id}` : `new-${query.date}`;

  return (
    <Page
      kicker="Life"
      title="Calendar"
      lede="Your events, with tasks, exams, goals, milestones and dates from their own pages."
    >
      <CalendarToolbar query={query} today={today} heading={headingFor(query, range.from, range.to)} />
      <FilterBar query={query} />

      {missingEvent ? (
        <p className="tk-callout" role="status">
          That event no longer exists.{" "}
          <Link href={calendarHref(query, { event: null, isNew: false })} prefetch={false}>
            Back to the calendar
          </Link>
        </p>
      ) : null}

      {formOpen ? (
        <EventForm
          key={formKey}
          eventId={editing?.id ?? null}
          values={editing ? eventFormValues(editing) : blankEventFormValues(query.date)}
          returnTo={listSearch(query)}
          cancelHref={calendarHref(query, { event: null, isNew: false })}
        />
      ) : null}

      <RemindersPanel reminders={reminders} />

      <div className="cal-body" data-view={query.view}>
        {query.view === "month" ? <MonthView query={query} today={today} byDay={byDay} /> : null}
        {query.view === "week" ? (
          <WeekColumns
            days={weekDays(range.from, today, byDay)}
            query={query}
          />
        ) : null}
        {query.view === "day" ? (
          <DayAgenda date={query.date} items={byDay.get(query.date) ?? []} query={query} />
        ) : null}
        {query.view === "upcoming" ? (
          <UpcomingList groups={upcomingGroups(byDay)} query={query} />
        ) : null}
      </div>
    </Page>
  );
}

function MonthView({
  query,
  today,
  byDay,
}: {
  query: CalendarQuery;
  today: string;
  byDay: Map<string, CalendarItem[]>;
}) {
  const days: GridDay[] = monthGridDays(query.date).map((date) => {
    const list = byDay.get(date) ?? [];
    const overdue = list.some((item) => item.overdue);
    const label = [
      formatLongDate(date),
      list.length === 0 ? "no items" : `${list.length} item${list.length === 1 ? "" : "s"}`,
      overdue ? "has overdue items" : null,
      date === today ? "today" : null,
    ]
      .filter(Boolean)
      .join(", ");
    return {
      date,
      day: Number(date.slice(8, 10)),
      inMonth: date.slice(0, 7) === query.date.slice(0, 7),
      isToday: date === today,
      isSelected: date === query.date,
      count: list.length,
      categories: categoriesOf(list),
      overdue,
      href: calendarHref(query, { date, event: null, isNew: false }),
      label,
    };
  });
  return (
    <>
      <MonthGrid
        days={days}
        weekdayLabels={WEEKDAYS}
        previousHref={calendarHref(query, { date: shiftDate("month", query.date, -1), event: null, isNew: false })}
        nextHref={calendarHref(query, { date: shiftDate("month", query.date, 1), event: null, isNew: false })}
      />
      <DayAgenda date={query.date} items={byDay.get(query.date) ?? []} query={query} />
    </>
  );
}

function weekDays(from: string, today: string, byDay: Map<string, CalendarItem[]>) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(from, index);
    return { date, isToday: date === today, items: byDay.get(date) ?? [] };
  });
}

function upcomingGroups(byDay: Map<string, CalendarItem[]>) {
  return [...byDay.keys()]
    .sort()
    .map((date) => ({ date, items: byDay.get(date) ?? [] }));
}

function headingFor(query: CalendarQuery, from: string, to: string): string {
  switch (query.view) {
    case "month":
      return new Date(`${startOfMonth(query.date)}T00:00:00Z`).toLocaleDateString("en", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    case "week":
      return `${formatShortDate(from)} to ${formatShortDate(to)}, ${from.slice(0, 4)}`;
    case "day":
      return formatLongDate(query.date);
    case "upcoming":
      return `Next ${UPCOMING_DAYS} days`;
  }
}
