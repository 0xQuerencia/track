import Link from "next/link";
import { calendarHref, type CalendarQuery } from "@/lib/calendar/url";
import {
  SOURCE_NAMES,
  SOURCE_PAGE,
  formatClock,
  formatShortDate,
  type CalendarItem,
} from "@/lib/calendar/model";

/** One calendar item. Events open the editor here; other sources open their own page. */
export function ItemRow({
  item,
  query,
  showDate = false,
}: {
  item: CalendarItem;
  query: CalendarQuery;
  showDate?: boolean;
}) {
  const href = item.editable ? calendarHref(query, { event: item.sourceId, isNew: false }) : item.href;
  const when = item.allDay
    ? "All day"
    : item.endTime
      ? `${formatClock(item.time ?? "")} to ${formatClock(item.endTime)}`
      : formatClock(item.time ?? "");
  const span = item.endDate ? `${formatShortDate(item.date)} to ${formatShortDate(item.endDate)}` : null;
  const status = [
    item.overdue ? "Overdue" : null,
    item.done ? "Done" : null,
    item.repeats ? "Repeats" : null,
  ].filter((flag): flag is string => flag !== null);

  return (
    <li
      className="cal-item"
      data-calcat={item.category}
      data-overdue={item.overdue || undefined}
      data-done={item.done || undefined}
    >
      <Link
        href={href}
        className="cal-item-link"
        prefetch={false}
        aria-label={`${item.title}, ${SOURCE_NAMES[item.source]}, ${when}${item.editable ? ", edit" : `, open in ${SOURCE_PAGE[item.source]}`}`}
      >
        <span className="cal-item-when">
          {showDate ? `${formatShortDate(item.date)} · ` : ""}
          {when}
        </span>
        <span className="cal-item-body">
          <span className="cal-item-title">{item.title}</span>
          <span className="cal-item-meta">
            <span className="cal-dot" data-calcat={item.category} aria-hidden="true" />
            <span>{item.category}</span>
            <span aria-hidden="true">·</span>
            <span>{SOURCE_NAMES[item.source]}</span>
            {item.detail ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{item.detail}</span>
              </>
            ) : null}
            {span ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{span}</span>
              </>
            ) : null}
          </span>
        </span>
        {status.length ? (
          <span className="cal-item-flags">
            {status.map((flag) => (
              <span key={flag} className="cal-flag" data-flag={flag.toLowerCase()}>
                {flag}
              </span>
            ))}
          </span>
        ) : null}
      </Link>
      {!item.editable ? <span className="cal-readonly">Read-only here · {SOURCE_PAGE[item.source]}</span> : null}
    </li>
  );
}
