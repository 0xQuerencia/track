import {eraseSchedules} from "./schedules";
import {eraseStudio} from "./studio";
import {jobTransaction} from "./jobs";
import {eraseAllMissionRows} from "./job-privacy";
import {setConsent} from "@/lib/ai";
import type { DatabaseSync } from "node:sqlite";
import { getAiStatus, getConsent } from "@/lib/ai";
import type { AiDisclosure } from "@/lib/ai";
import { todayStr } from "@/lib/dates";
import { getAiDisclosurePreview } from "./queries";
import { enhanceThemesWithAi, type ChatJsonCaller } from "./layer-b";
import { getSourceSetting } from "./engine";
import { analyzeSources } from "./engine";
import type { RunSummary } from "./types";
import { discoverOvernightSkills } from "./chief";

type RunRow = { id: number; notes: string | null; new_insights: number; new_suggestions: number };

function localDate(now: Date): string {
  if (todayStr() === now.toISOString().slice(0, 10)) return todayStr();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.TRACK_TZ ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

function parseNotes(value: string | null): { aiAttempted?: boolean; aiNotice?: string | null } {
  try { return JSON.parse(value ?? "{}") as { aiAttempted?: boolean; aiNotice?: string | null }; }
  catch { return {}; }
}

function writeDailyBrief(db: DatabaseSync, input: {
  date: string; runId: number; newInsights: number; newSuggestions: number; processed: number; unchanged: number; aiNotice: string | null;
}): string {
  const { date, runId, newInsights, newSuggestions, processed, unchanged, aiNotice } = input;
  let body: string;
  if (newInsights === 0 && newSuggestions === 0) {
    const previous = db.prepare(`SELECT period_key FROM dreamer_briefs WHERE kind = 'daily' AND period_key < ? ORDER BY period_key DESC LIMIT 1`).get(date) as { period_key: string } | undefined;
    body = previous
      ? `Nothing new since ${previous.period_key}. The local scan processed ${processed} changed source${processed === 1 ? "" : "s"} and skipped ${unchanged} unchanged.`
      : `No meaningful insight or suggestion was supported on this first scan. The local scan processed ${processed} changed source${processed === 1 ? "" : "s"} and skipped ${unchanged} unchanged.`;
  } else {
    const insights = db.prepare(`SELECT text FROM dreamer_insights WHERE last_confirmed = ? AND review_state = 'new'
      ORDER BY CASE kind WHEN 'commitment' THEN 0 WHEN 'problem' THEN 1 WHEN 'improvement' THEN 2 WHEN 'intention' THEN 3 WHEN 'project_idea' THEN 4 WHEN 'unresolved_question' THEN 5 ELSE 9 END, confidence DESC LIMIT 3`).all(date) as { text: string }[];
    const suggestions = db.prepare(`SELECT title FROM dreamer_suggestions WHERE cycle_id = ? ORDER BY id LIMIT 2`).all(runId) as { title: string }[];
    const parts = [
      `Dreamer found ${newInsights} candidate insight${newInsights === 1 ? "" : "s"}`,
      newSuggestions ? `${newSuggestions} evidence-backed suggestion${newSuggestions === 1 ? "" : "s"}` : "no new suggestions warranted",
    ];
    body = [
      `${parts.join(" and ")}. These are reviewable hypotheses; inspect their evidence before acting.`,
      insights.length ? `\nCandidate insights:\n${insights.map((item) => `- ${item.text}`).join("\n")}` : "",
      suggestions.length ? `\nSuggestions:\n${suggestions.map((item) => `- ${item.title}`).join("\n")}` : "",
    ].filter(Boolean).join("\n");
  }
  if (aiNotice) body += `\n\n${aiNotice}`;
  db.prepare(`INSERT INTO dreamer_briefs (period_key, kind, body_md, run_id) VALUES (?, 'daily', ?, ?)
    ON CONFLICT(kind, period_key) DO UPDATE SET body_md = excluded.body_md, run_id = excluded.run_id`)
    .run(date, body, runId);
  return body;
}

/**
 * Idempotent once-per-local-day cycle. Local analysis always runs first and
 * never needs consent. AI is an optional, separately gated enhancement.
 */
export async function runDailyCycle(db: DatabaseSync, now = new Date(), options: {
  sendToAi?: boolean;
  /** The UI's explicit Run now action rescans changed content within today's daily row. */
  force?: boolean;
  approvedDisclosure?: AiDisclosure;
  disclosureMismatch?: boolean;
  chatJsonImpl?: ChatJsonCaller;
} = {}): Promise<RunSummary> {
  const periodKey = localDate(now);
  const current = db.prepare(`SELECT id, notes, new_insights, new_suggestions FROM dreamer_runs
    WHERE kind = 'daily' AND period_key = ?`).get(periodKey) as RunRow | undefined;
  if (!current && !(["journal", "note", "idea"] as const).some((source) => getSourceSetting(db, source))) {
    return { id: 0, kind: "daily", periodKey, alreadyRan: false, processed: 0, unchanged: 0,
      newInsights: 0, newSuggestions: 0, aiNotice: null, brief: "Dreamer is paused because every source is disabled." };
  }
  let runId: number;
  let processed = 0;
  let unchanged = 0;
  let newInsights = 0;
  let newSuggestions = 0;
  let aiNotice: string | null = null;
  let notes = current ? parseNotes(current.notes) : {};
  const alreadyRan = Boolean(current);

  if (current) {
    runId = current.id;
    newInsights = current.new_insights;
    newSuggestions = current.new_suggestions;
    if (options.force) {
      const baseline = analyzeSources(db, runId, now);
      processed = baseline.processed;
      unchanged = baseline.unchanged;
      newInsights += baseline.newInsights;
      newSuggestions += baseline.newSuggestions;
    }
  } else {
    const inserted = db.prepare(`INSERT INTO dreamer_runs (kind, period_key, started_at, ok)
      VALUES ('daily', ?, ?, 0)`).run(periodKey, now.toISOString());
    runId = Number(inserted.lastInsertRowid);
    const baseline = analyzeSources(db, runId, now);
    processed = baseline.processed;
    unchanged = baseline.unchanged;
    newInsights = baseline.newInsights;
    newSuggestions = baseline.newSuggestions;
  }

  const consent = getConsent(db, "dreamer");
  const shouldCallAi = consent.enabled && !options.disclosureMismatch && (options.sendToAi === true || consent.scope.allowDailyCycle);
  if (options.disclosureMismatch) {
    aiNotice = "AI was not called because the source excerpts changed after the preview. Review the updated disclosure and confirm again.";
    notes = { ...notes, aiNotice };
  }
  if (shouldCallAi && (!notes.aiAttempted || (options.force && options.sendToAi))) {
    const ai = await enhanceThemesWithAi({
      db, consent, status: getAiStatus(db), disclosure: options.approvedDisclosure ?? getAiDisclosurePreview(db),
      sendToAi: options.sendToAi === true, chatJsonImpl: options.chatJsonImpl, now,
    });
    if (ai.attempted) {
      notes = { ...notes, aiAttempted: true, aiNotice: ai.notice };
      newInsights += ai.created;
      aiNotice = ai.notice;
    }
  } else if (shouldCallAi && notes.aiAttempted) {
    aiNotice = notes.aiNotice ?? null;
  }

  discoverOvernightSkills(db);
  const brief = writeDailyBrief(db, { date: periodKey, runId, newInsights, newSuggestions, processed, unchanged, aiNotice });
  db.prepare(`UPDATE dreamer_runs SET finished_at = ?, ok = 1, new_insights = ?, new_suggestions = ?, notes = ? WHERE id = ?`)
    .run(now.toISOString(), newInsights, newSuggestions, JSON.stringify(notes), runId);
  return { id: runId, kind: "daily", periodKey, alreadyRan, processed, unchanged, newInsights, newSuggestions, aiNotice, brief };
}

function isoWeekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day.toISOString().slice(0, 10);
}

/** Idempotent weekly reflection; every generated observation is explicitly framed as a hypothesis. */
export function runWeeklyReflection(db: DatabaseSync, weekStart: string, now = new Date()): RunSummary {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || Number.isNaN(Date.parse(`${weekStart}T00:00:00Z`)))
    throw new RangeError("Use a valid YYYY-MM-DD week start.");
  const periodKey = isoWeekStart(weekStart);
  const old = db.prepare(`SELECT id, notes, new_insights, new_suggestions FROM dreamer_runs
    WHERE kind = 'weekly' AND period_key = ?`).get(periodKey) as RunRow | undefined;
  if (old) {
    const body = db.prepare("SELECT body_md FROM dreamer_briefs WHERE kind = 'weekly' AND period_key = ?").get(periodKey) as { body_md: string } | undefined;
    return { id: old.id, kind: "weekly", periodKey, alreadyRan: true, processed: 0, unchanged: 0,
      newInsights: old.new_insights, newSuggestions: old.new_suggestions, aiNotice: null, brief: body?.body_md ?? "" };
  }
  const inserted = db.prepare(`INSERT INTO dreamer_runs (kind, period_key, started_at, ok)
    VALUES ('weekly', ?, ?, 0)`).run(periodKey, now.toISOString());
  const runId = Number(inserted.lastInsertRowid);
  const themes = db.prepare(`SELECT id, text, confidence FROM dreamer_insights
    WHERE kind = 'recurring_theme' AND review_state NOT IN ('dismissed', 'blocked', 'outdated')
    ORDER BY confidence DESC LIMIT 8`).all() as { id: number; text: string; confidence: number }[];
  const intentions = db.prepare(`SELECT id, text, confidence FROM dreamer_insights
    WHERE kind IN ('intention', 'commitment', 'problem', 'improvement')
      AND review_state NOT IN ('dismissed', 'blocked', 'outdated') ORDER BY last_confirmed DESC LIMIT 8`).all() as { id: number; text: string; confidence: number }[];
  const goals = db.prepare("SELECT title, status FROM goals WHERE status IN ('Active', 'Paused') ORDER BY target_date IS NULL, target_date LIMIT 8").all() as { title: string; status: string }[];
  const projects = db.prepare("SELECT name, status, milestone FROM projects WHERE archived = 0 ORDER BY status, name LIMIT 8").all() as { name: string; status: string; milestone: string | null }[];
  const tasks = db.prepare("SELECT status, COUNT(*) AS count FROM tasks GROUP BY status").all() as { status: string; count: number }[];
  const experiments = db.prepare("SELECT id, title FROM dreamer_suggestions WHERE state IN ('new', 'save_later', 'explore', 'useful') ORDER BY created_at DESC LIMIT 4").all() as { id: number; title: string }[];
  const previous = db.prepare("SELECT period_key FROM dreamer_briefs WHERE kind = 'weekly' AND period_key < ? ORDER BY period_key DESC LIMIT 1").get(periodKey) as { period_key: string } | undefined;
  const since = previous?.period_key ?? "0000-00-00";
  const recent = db.prepare(`SELECT kind, COUNT(*) AS count FROM dreamer_insights
    WHERE created_at >= ? GROUP BY kind ORDER BY count DESC`).all(since) as { kind: string; count: number }[];

  const lines = [
    `## Weekly reflection · ${periodKey}`,
    "Every item below is a hypothesis for your judgment, not a personal fact.",
    "",
    "### Recurring themes",
    ...(themes.length ? themes.map((item) => `- Hypothesis: ${item.text} (${Math.round(item.confidence * 100)}% local evidence score).`) : ["- No recurring theme met the local evidence threshold." ]),
    "",
    "### Goals and project progress",
    ...(goals.length ? goals.map((goal) => `- Hypothesis to review: ${goal.title} is marked ${goal.status.toLowerCase()}.`) : ["- No active goals are recorded."]),
    ...(projects.length ? projects.map((project) => `- Project record: ${project.name} · ${project.status}${project.milestone ? ` · ${project.milestone}` : ""}.`) : ["- No active projects are recorded."]),
    `- Recorded task counts: ${tasks.map((task) => `${task.status}: ${task.count}`).join(", ") || "none"}.`,
    "",
    "### Unfinished intentions and problems",
    ...(intentions.length ? intentions.map((item) => `- Hypothesis: ${item.text} (${Math.round(item.confidence * 100)}% local evidence score).`) : ["- No current intention or problem candidates need review."]),
    "",
    "### Promising experiments",
    ...(experiments.length ? experiments.map((item) => `- Hypothesis: ${item.title}.`) : ["- No experiment is supported strongly enough to suggest."]),
    "",
    "### What changed since the previous review",
    ...(recent.length ? recent.map((item) => `- ${item.count} candidate ${item.kind.replaceAll("_", " ")}${item.count === 1 ? "" : "s"} detected since ${since}.`) : ["- No new candidate evidence has been recorded since the previous review."]),
    "",
    "Check the linked excerpts before confirming or changing any of these observations.",
  ].join("\n");
  db.prepare(`INSERT INTO dreamer_briefs (period_key, kind, body_md, run_id) VALUES (?, 'weekly', ?, ?)`)
    .run(periodKey, lines, runId);
  db.prepare("UPDATE dreamer_runs SET finished_at = ?, ok = 1, notes = ? WHERE id = ?")
    .run(now.toISOString(), JSON.stringify({ hypothesisOnly: true }), runId);
  return { id: runId, kind: "weekly", periodKey, alreadyRan: false, processed: 0, unchanged: 0,
    newInsights: 0, newSuggestions: 0, aiNotice: null, brief: lines };
}

export function deleteAllDreamerData(db: DatabaseSync): void {
  jobTransaction(db,()=>{
  eraseAllMissionRows(db);
  eraseSchedules(db);
  eraseStudio(db);
  setConsent(db,"dreamer",false);
  for (const table of [
    "dreamer_skills", "dreamer_workflow_candidates", "dreamer_agent_steps", "dreamer_chief_messages", "dreamer_missions", "dreamer_agent_config",
    "dreamer_feedback", "dreamer_suggestion_projects", "dreamer_suggestion_evidence", "dreamer_suggestions",
    "dreamer_insight_projects", "dreamer_insight_evidence", "dreamer_insights", "dreamer_terms", "dreamer_evidence",
    "dreamer_briefs", "dreamer_runs", "dreamer_documents", "dreamer_sources", "dreamer_links", "dreamer_settings",
  ]) db.prepare(`DELETE FROM ${table}`).run();
  // Prevent the dashboard's lazy daily cycle from recreating data immediately.
  for (const source of ["journal", "note", "idea"] as const) {
    db.prepare("INSERT INTO dreamer_settings (key, value) VALUES (?, '0')").run(`source:${source}`);
  }
  });
}
