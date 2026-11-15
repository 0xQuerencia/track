import { getDb } from "../db";

/*
 * Life timeline: a read-only view computed from the source tables, so nothing
 * is stored twice and nothing can be invented. Event ids are "<source>:<rowid>"
 * and stay stable between calls. Dates derived from created_at are UTC dates.
 * Journal entries expose only their date, never their text or title.
 */

export type TimelineEvent = {
  id: string;
  category: TimelineCategory;
  date: string;
  title: string;
  href: string;
};

export const TIMELINE_CATEGORIES = [
  "Tasks",
  "Study",
  "Focus",
  "Goals",
  "Projects",
  "AI sessions",
  "Ideas",
  "Notes",
  "Journal",
  "Career",
  "Health",
] as const;
export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number];

type Source = {
  key: string;
  category: TimelineCategory;
  href: string;
  /** Constant SQL (never built from input). Must select id, d (YYYY-MM-DD), t (title). */
  sql: string;
};

const PER_SOURCE_LIMIT = 200;

const SOURCES: readonly Source[] = [
  { key: "task", category: "Tasks", href: "/plans", sql: `SELECT id, completed_on AS d, 'Completed: ' || title AS t FROM tasks WHERE completed_on BETWEEN ?1 AND ?2` },
  { key: "study", category: "Study", href: "/study", sql: `SELECT id, date AS d, 'Studied ' || COALESCE(subject, '') || ' for ' || CAST(minutes AS INTEGER) || ' min' AS t FROM study_sessions WHERE date BETWEEN ?1 AND ?2` },
  { key: "revision", category: "Study", href: "/study", sql: `SELECT r.id, r.date AS d, 'Revised ' || COALESCE(c.name, 'a chapter') AS t FROM revisions r LEFT JOIN chapters c ON c.id = r.chapter_id WHERE r.date BETWEEN ?1 AND ?2` },
  { key: "mock", category: "Study", href: "/study", sql: `SELECT id, date AS d, 'Mock test: ' || name AS t FROM mock_tests WHERE date BETWEEN ?1 AND ?2` },
  { key: "focus", category: "Focus", href: "/focus", sql: `SELECT id, date AS d, 'Focused ' || CAST(minutes AS INTEGER) || ' min' || CASE WHEN label IS NULL OR label = '' THEN '' ELSE ' on ' || label END AS t FROM focus_sessions WHERE date BETWEEN ?1 AND ?2` },
  { key: "goal", category: "Goals", href: "/plans", sql: `SELECT id, substr(created_at, 1, 10) AS d, 'Goal set: ' || title AS t FROM goals WHERE substr(created_at, 1, 10) BETWEEN ?1 AND ?2` },
  { key: "project", category: "Projects", href: "/projects", sql: `SELECT id, substr(created_at, 1, 10) AS d, 'Project added: ' || name AS t FROM projects WHERE substr(created_at, 1, 10) BETWEEN ?1 AND ?2` },
  { key: "milestone", category: "Projects", href: "/projects", sql: `SELECT m.id, substr(m.completed_at, 1, 10) AS d, 'Milestone done: ' || m.title AS t FROM project_milestones m WHERE m.completed_at IS NOT NULL AND substr(m.completed_at, 1, 10) BETWEEN ?1 AND ?2` },
  { key: "ai_session", category: "AI sessions", href: "/sessions", sql: `SELECT id, substr(last_activity_at, 1, 10) AS d, COALESCE(NULLIF(title, ''), tool || ' session') AS t FROM ai_sessions WHERE last_activity_at IS NOT NULL AND substr(last_activity_at, 1, 10) BETWEEN ?1 AND ?2` },
  { key: "idea", category: "Ideas", href: "/ideas", sql: `SELECT id, substr(created_at, 1, 10) AS d, 'Idea captured: ' || title AS t FROM ideas WHERE substr(created_at, 1, 10) BETWEEN ?1 AND ?2` },
  { key: "note", category: "Notes", href: "/knowledge", sql: `SELECT id, substr(created_at, 1, 10) AS d, 'Note: ' || title AS t FROM notes WHERE substr(created_at, 1, 10) BETWEEN ?1 AND ?2` },
  { key: "journal", category: "Journal", href: "/journal", sql: `SELECT id, date AS d, 'Journal entry' AS t FROM journal_entries WHERE date BETWEEN ?1 AND ?2` },
  { key: "career", category: "Career", href: "/career", sql: `SELECT h.id, substr(h.at, 1, 10) AS d, COALESCE(o.title, 'Opportunity') || ': ' || COALESCE(h.from_status || ' to ', 'started as ') || h.to_status AS t FROM career_history h LEFT JOIN opportunities o ON o.id = h.opportunity_id WHERE substr(h.at, 1, 10) BETWEEN ?1 AND ?2` },
  { key: "achievement", category: "Career", href: "/career", sql: `SELECT id, achieved_on AS d, 'Achieved: ' || title AS t FROM opportunities WHERE achieved_on BETWEEN ?1 AND ?2` },
  { key: "workout", category: "Health", href: "/health", sql: `SELECT id, date AS d, 'Workout: ' || COALESCE(NULLIF(name, ''), kind) AS t FROM workouts WHERE date BETWEEN ?1 AND ?2` },
];

export type TimelineQuery = {
  from: string;
  to: string;
  categories?: readonly string[];
  q?: string;
  limit?: number;
};

export function getTimeline(query: TimelineQuery): { events: TimelineEvent[]; truncated: boolean } {
  const db = getDb();
  const wanted = query.categories?.length ? new Set(query.categories) : null;
  const needle = query.q?.trim().toLowerCase().slice(0, 80) ?? "";
  const limit = Math.min(Math.max(query.limit ?? 300, 1), 1000);
  const events: TimelineEvent[] = [];
  let truncated = false;
  for (const source of SOURCES) {
    if (wanted && !wanted.has(source.category)) continue;
    const rows = db
      .prepare(`${source.sql} ORDER BY d DESC LIMIT ${PER_SOURCE_LIMIT + 1}`)
      .all(query.from, query.to) as { id: number; d: string; t: string }[];
    if (rows.length > PER_SOURCE_LIMIT) truncated = true;
    for (const row of rows.slice(0, PER_SOURCE_LIMIT)) {
      if (!row.d || !row.t) continue;
      if (needle && !row.t.toLowerCase().includes(needle)) continue;
      events.push({
        id: `${source.key}:${row.id}`,
        category: source.category,
        date: row.d,
        title: row.t,
        href: source.href,
      });
    }
  }
  events.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : b.date.localeCompare(a.date)));
  if (events.length > limit) truncated = true;
  return { events: events.slice(0, limit), truncated };
}
