import type { DatabaseSync } from "node:sqlite";
import { getUpcomingItems } from "@/lib/calendar/aggregate";
import { daysUntil, shortDay } from "@/lib/dates";
import { dailyBrief } from "@/lib/dreamer/queries";
import { getGoalSummaries, getOverdueTasks } from "@/lib/plans";
import { getRevisionQueue } from "@/lib/study";
import { todayCheckinDone } from "@/lib/checkin";

export type BriefLine = { text: string; href?: string };
export type BriefSection = { title: string; lines: BriefLine[] };

/** Deterministic and instant: built only from records already in the app, nothing sent anywhere. */
export function buildBrief(db: DatabaseSync, today: string): BriefSection[] {
  const sections: BriefSection[] = [];
  const add = (title: string, lines: BriefLine[]) => { if (lines.length) sections.push({ title, lines }); };

  const agenda = getUpcomingItems(3).slice(0, 6);
  add("Coming up", agenda.map((item) => ({
    text: `${item.date === today ? "Today" : shortDay(item.date)}${item.time ? ` ${item.time}` : ""}: ${item.title}`,
    href: item.href,
  })));

  const overdue = getOverdueTasks(today).slice(0, 6);
  add("Needs attention", overdue.map((t) => ({
    text: `${t.title}${t.due ? (t.due < today ? ` (overdue since ${shortDay(t.due)})` : " (due today)") : ""}`,
    href: "/plans?tab=tasks",
  })));

  const revisions = getRevisionQueue(today, 3);
  add("Study", revisions.map((r) => ({ text: `Revise ${r.name} (${r.subject}, about ${r.estMinutes} min)`, href: "/study" })));

  const goals = getGoalSummaries(4).filter((g) => g.reviewDue || (g.targetDate && daysUntil(g.targetDate, today) <= 14));
  add("Goals", goals.map((g) => ({
    text: g.reviewDue ? `Review due: ${g.title}` : `${g.title}, target ${shortDay(g.targetDate as string)}`,
    href: "/plans?tab=goals",
  })));

  const loggedToday = todayCheckinDone(db, today)
    || Boolean(db.prepare("SELECT 1 FROM health_logs WHERE date = ? AND (sleep_hours IS NOT NULL OR energy IS NOT NULL) LIMIT 1").get(today))
    || Boolean(db.prepare("SELECT 1 FROM body_measurements WHERE date = ? LIMIT 1").get(today));
  if (!loggedToday) add("Log", [{ text: "You have not logged sleep, energy or weight today. Just tell me below." }]);

  const dream = dailyBrief(db, today);
  const firstInsight = dream?.split("\n").find((l) => l.startsWith("- "));
  if (firstInsight) add("Dreamer noticed", [{ text: firstInsight.slice(2, 160), href: "/dreamer" }]);

  return sections;
}
