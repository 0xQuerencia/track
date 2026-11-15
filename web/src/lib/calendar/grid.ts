import type { CalendarItem, EventCategory } from "./model";
import { addDays } from "./time";

/*
 * Pure helpers that place items on days. Multi-day items appear on every day
 * they cover, clipped to the requested range.
 */

/** Items grouped by ISO date for each day in [from, to]. Days without items are absent. */
export function itemsByDay(items: readonly CalendarItem[], from: string, to: string): Map<string, CalendarItem[]> {
  const byDay = new Map<string, CalendarItem[]>();
  for (const entry of items) {
    const last = entry.endDate ?? entry.date;
    const start = entry.date > from ? entry.date : from;
    const end = last < to ? last : to;
    for (let day = start; day <= end; day = addDays(day, 1)) {
      const list = byDay.get(day);
      if (list) list.push(entry);
      else byDay.set(day, [entry]);
    }
  }
  return byDay;
}

/** Distinct categories of a day's items, in first-seen order. */
export function categoriesOf(items: readonly CalendarItem[]): EventCategory[] {
  return [...new Set(items.map((entry) => entry.category))];
}
