import Link from "next/link";
import {
  CALENDAR_SOURCES,
  CALENDAR_VIEWS,
  EVENT_CATEGORIES,
  SOURCE_LABELS,
  VIEW_LABELS,
  type CalendarSource,
  type EventCategory,
} from "@/lib/calendar/model";
import { calendarHref, shiftDate, type CalendarQuery } from "@/lib/calendar/url";

/** Toolbar: view switch, previous, today, next, and the new-event entry. */
export function CalendarToolbar({
  query,
  today,
  heading,
}: {
  query: CalendarQuery;
  today: string;
  heading: string;
}) {
  const navigable = query.view !== "upcoming";
  return (
    <div className="cal-toolbar">
      <div className="cal-nav" role="group" aria-label="Move through the calendar">
        {navigable ? (
          <>
            <Link className="tk-button tk-ghost" href={calendarHref(query, { date: shiftDate(query.view, query.date, -1), event: null, isNew: false })} prefetch={false} aria-label={`Previous ${query.view}`}>
              ‹
            </Link>
            <Link className="tk-button tk-ghost" href={calendarHref(query, { date: today, event: null, isNew: false })} prefetch={false}>
              Today
            </Link>
            <Link className="tk-button tk-ghost" href={calendarHref(query, { date: shiftDate(query.view, query.date, 1), event: null, isNew: false })} prefetch={false} aria-label={`Next ${query.view}`}>
              ›
            </Link>
          </>
        ) : null}
        <h2 className="cal-heading" aria-live="polite">
          {heading}
        </h2>
      </div>
      <div className="cal-views" role="group" aria-label="View">
        {CALENDAR_VIEWS.map((view) => (
          <Link
            key={view}
            href={calendarHref(query, { view, event: null, isNew: false })}
            prefetch={false}
            className="tk-chip"
            aria-current={view === query.view ? "page" : undefined}
          >
            {VIEW_LABELS[view]}
          </Link>
        ))}
      </div>
      <Link
        href={calendarHref(query, { isNew: true, event: null })}
        prefetch={false}
        className="tk-button tk-primary cal-new"
      >
        New event
      </Link>
    </div>
  );
}

/** Two rows of filter chips: where items come from, and what kind they are. */
export function FilterBar({ query }: { query: CalendarQuery }) {
  return (
    <div className="cal-filters">
      <FilterGroup
        label="Source"
        allLabel="All sources"
        options={CALENDAR_SOURCES.map((source) => ({ value: source, label: SOURCE_LABELS[source] }))}
        selected={query.sources}
        hrefFor={(next) => calendarHref({ ...query, sources: next as CalendarSource[], event: null, isNew: false })}
      />
      <FilterGroup
        label="Category"
        allLabel="All categories"
        options={EVENT_CATEGORIES.map((category) => ({ value: category, label: category }))}
        selected={query.categories}
        hrefFor={(next) => calendarHref({ ...query, categories: next as EventCategory[], event: null, isNew: false })}
      />
    </div>
  );
}

function FilterGroup({
  label,
  allLabel,
  options,
  selected,
  hrefFor,
}: {
  label: string;
  allLabel: string;
  options: { value: string; label: string }[];
  selected: readonly string[];
  hrefFor: (next: string[]) => string;
}) {
  const order = options.map((option) => option.value);
  const toggle = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    return order.filter((item) => next.includes(item));
  };
  return (
    <div className="cal-filter-row" role="group" aria-label={`Filter by ${label.toLowerCase()}`}>
      <span className="cal-filter-label">{label}</span>
      <div className="tk-chips">
        <Link
          href={hrefFor([])}
          prefetch={false}
          className="tk-chip"
          aria-current={selected.length === 0 ? "true" : undefined}
        >
          {allLabel}
        </Link>
        {options.map((option) => (
          <Link
            key={option.value}
            href={hrefFor(toggle(option.value))}
            prefetch={false}
            className="tk-chip cal-chip"
            data-calcat={label === "Category" ? option.value : undefined}
            aria-current={selected.includes(option.value) ? "true" : undefined}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
