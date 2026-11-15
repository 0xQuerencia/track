"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { EventCategory } from "@/lib/calendar/model";

export type GridDay = {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  count: number;
  categories: EventCategory[];
  overdue: boolean;
  href: string;
  label: string;
};

const COLUMNS = 7;
const CELLS = 42;

/**
 * Six-week month grid. Each day is a link, so Enter opens its agenda, and the
 * arrow keys move focus between days (roving tabindex). PageUp and PageDown
 * step months, Home and End go to the first and last day of the week.
 */
export function MonthGrid({
  days,
  weekdayLabels,
  previousHref,
  nextHref,
}: {
  days: GridDay[];
  weekdayLabels: string[];
  previousHref: string;
  nextHref: string;
}) {
  const router = useRouter();
  const cells = useRef<(HTMLAnchorElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    days.findIndex((day) => day.isSelected),
  );
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const active = focusIndex ?? selectedIndex;

  function move(index: number) {
    if (index < 0 || index >= CELLS) return;
    setFocusIndex(index);
    cells.current[index]?.focus();
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>, index: number) {
    const row = index - (index % COLUMNS);
    const keys: Record<string, () => void> = {
      ArrowLeft: () => move(index - 1),
      ArrowRight: () => move(index + 1),
      ArrowUp: () => move(index - COLUMNS),
      ArrowDown: () => move(index + COLUMNS),
      Home: () => move(row),
      End: () => move(row + COLUMNS - 1),
      PageUp: () => router.push(previousHref, { scroll: false }),
      PageDown: () => router.push(nextHref, { scroll: false }),
    };
    const handler = keys[event.key];
    if (!handler) return;
    event.preventDefault();
    handler();
  }

  return (
    <div className="cal-month" role="group" aria-label="Month">
      <div className="cal-weekdays" aria-hidden="true">
        {weekdayLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div
        className="cal-grid"
        onKeyDown={(event) => {
          const index = Number((event.target as HTMLElement).dataset.index);
          if (Number.isInteger(index)) handleKey(event, index);
        }}
      >
        {days.map((day, index) => (
          <Link
            key={day.date}
            ref={(node) => {
              cells.current[index] = node;
            }}
            href={day.href}
            prefetch={false}
            className="cal-day"
            data-outside={day.inMonth ? undefined : true}
            data-today={day.isToday || undefined}
            data-selected={day.isSelected || undefined}
            data-overdue={day.overdue || undefined}
            aria-label={day.label}
            aria-current={day.isSelected ? "date" : undefined}
            tabIndex={index === active ? 0 : -1}
            onFocus={() => setFocusIndex(index)}
            data-index={index}
          >
            <span className="cal-day-number">{day.day}</span>
            {day.categories.length ? (
              <span className="cal-dots" aria-hidden="true">
                {day.categories.slice(0, 4).map((category) => (
                  <span key={category} className="cal-dot" data-calcat={category} />
                ))}
              </span>
            ) : null}
            {day.count > 0 ? <span className="cal-day-count" aria-hidden="true">{day.count}</span> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
