import type { DatabaseSync } from "node:sqlite";
import { buildDisclosure, getAiStatus, getConsent, redactForAi } from "@/lib/ai";
import { todayStr } from "@/lib/dates";
import { getExcludedValues, getSourceSetting, getVisibleCategoriesAndTags } from "./engine";
import type { DreamerSource } from "./types";

type Row = Record<string, unknown>;

export type DreamerEvidenceView = {
  id: number;
  source: DreamerSource;
  refId: string;
  quote: string;
  date: string;
  href: string;
};

export function sourceHref(source: DreamerSource, refId: string): string {
  if (source === "journal") return `/journal/${encodeURIComponent(refId)}`;
  if (source === "note") return `/knowledge/${encodeURIComponent(refId)}`;
  return `/ideas/${encodeURIComponent(refId)}`;
}

function evidenceFor(db: DatabaseSync, table: "dreamer_insight_evidence" | "dreamer_suggestion_evidence", id: number): DreamerEvidenceView[] {
  const key = table === "dreamer_insight_evidence" ? "insight_id" : "suggestion_id";
  const rows = db.prepare(`SELECT e.id, e.source, e.ref_id, e.quote, e.date
    FROM ${table} x JOIN dreamer_evidence e ON e.id = x.evidence_id
    WHERE x.${key} = ? ORDER BY e.date DESC, e.id DESC`).all(id) as Row[];
  return rows.map((row) => ({
    id: Number(row.id), source: String(row.source) as DreamerSource, refId: String(row.ref_id),
    quote: String(row.quote), date: String(row.date), href: sourceHref(String(row.source) as DreamerSource, String(row.ref_id)),
  }));
}

/** Actionable kinds first; recurring themes are the weakest signal and sort last. */
export const KIND_PRIORITY_SQL = `CASE kind WHEN 'commitment' THEN 0 WHEN 'problem' THEN 1 WHEN 'improvement' THEN 2 WHEN 'intention' THEN 3
  WHEN 'project_idea' THEN 4 WHEN 'unresolved_question' THEN 5 WHEN 'learning_goal' THEN 6 WHEN 'interest' THEN 7 WHEN 'observation' THEN 8 ELSE 9 END`;
export const INSIGHT_PAGE_SIZE = 10;

export function countInsights(db: DatabaseSync, filters: { kind?: string; state?: string } = {}): number {
  const clauses: string[] = [];
  const values: string[] = [];
  if (filters.kind) { clauses.push("kind = ?"); values.push(filters.kind); }
  if (filters.state) { clauses.push("review_state = ?"); values.push(filters.state); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return Number((db.prepare(`SELECT COUNT(*) AS n FROM dreamer_insights ${where}`).get(...values) as { n: number }).n);
}

export function listInsights(db: DatabaseSync, filters: { kind?: string; state?: string; page?: number } = {}) {
  const offset = Math.max(0, Math.trunc((filters.page ?? 1) - 1)) * INSIGHT_PAGE_SIZE;
  const clauses: string[] = [];
  const values: string[] = [];
  if (filters.kind) { clauses.push("kind = ?"); values.push(filters.kind); }
  if (filters.state) { clauses.push("review_state = ?"); values.push(filters.state); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT id, kind, text, original_text, user_text, confidence, uncertainty_note,
      first_detected, last_confirmed, review_state, origin
    FROM dreamer_insights ${where} ORDER BY ${KIND_PRIORITY_SQL}, confidence DESC, last_confirmed DESC, id DESC LIMIT ${INSIGHT_PAGE_SIZE} OFFSET ${offset}`).all(...values) as Row[];
  return rows.map((row) => {
    const id = Number(row.id);
    const projects = db.prepare(`SELECT p.id, p.name FROM dreamer_insight_projects ip
      JOIN projects p ON p.id = ip.project_id WHERE ip.insight_id = ? ORDER BY p.name`).all(id) as { id: number; name: string }[];
    return {
      id, kind: String(row.kind), text: String(row.user_text ?? row.text), originalText: String(row.original_text),
      confidence: Number(row.confidence), uncertainty: String(row.uncertainty_note),
      firstDetected: String(row.first_detected), lastConfirmed: String(row.last_confirmed),
      state: String(row.review_state), origin: String(row.origin), evidence: evidenceFor(db, "dreamer_insight_evidence", id), projects,
    };
  });
}

export function listSuggestions(db: DatabaseSync) {
  const rows = db.prepare(`SELECT id, title, problem, why_it_matters, usefulness, difficulty,
      dependencies, prototype, next_steps, uncertainties, origin, state, created_at
    FROM dreamer_suggestions ORDER BY created_at DESC, id DESC LIMIT 60`).all() as Row[];
  return rows.map((row) => {
    const id = Number(row.id);
    const projects = db.prepare(`SELECT p.id, p.name FROM dreamer_suggestion_projects sp
      JOIN projects p ON p.id = sp.project_id WHERE sp.suggestion_id = ? ORDER BY p.name`).all(id) as { id: number; name: string }[];
    const feedback = db.prepare("SELECT choice, note, at FROM dreamer_feedback WHERE suggestion_id = ? ORDER BY id DESC LIMIT 3").all(id) as { choice: string; note: string | null; at: string }[];
    return {
      id, title: String(row.title), problem: String(row.problem), whyItMatters: String(row.why_it_matters),
      usefulness: String(row.usefulness), difficulty: String(row.difficulty), dependencies: String(row.dependencies),
      prototype: String(row.prototype), nextSteps: String(row.next_steps), uncertainties: String(row.uncertainties),
      origin: String(row.origin), state: String(row.state), createdAt: String(row.created_at),
      evidence: evidenceFor(db, "dreamer_suggestion_evidence", id), projects, feedback,
    };
  });
}

export function listGraphLinks(db: DatabaseSync) {
  const rows = db.prepare(`SELECT id, from_kind, from_id, to_kind, to_id, relation, polarity, weight, state, evidence_json, note
    FROM dreamer_links ORDER BY state = 'proposed' DESC, id DESC LIMIT 200`).all() as Row[];
  return rows.map((row) => {
    let evidenceIds: number[] = [];
    try { evidenceIds = JSON.parse(String(row.evidence_json)) as number[]; } catch { /* corrupted derived data is ignored */ }
    const evidence = evidenceIds.map((id) => {
      const e = db.prepare("SELECT id, source, ref_id, quote, date FROM dreamer_evidence WHERE id = ?").get(id) as Row | undefined;
      if (!e) return null;
      const source = String(e.source) as DreamerSource;
      return { id: Number(e.id), quote: String(e.quote), date: String(e.date), href: sourceHref(source, String(e.ref_id)) };
    }).filter((item): item is NonNullable<typeof item> => item !== null);
    const toKind = String(row.to_kind);
    const fromKind = String(row.from_kind);
    const toId = String(row.to_id);
    const fromId = String(row.from_id);
    const toTitle = graphNodeTitle(db, toKind, toId);
    const fromTitle = graphNodeTitle(db, fromKind, fromId);
    return {
      id: Number(row.id), fromKind, fromId, fromTitle, toKind,
      toId, toTitle,
      relation: String(row.relation), polarity: Number(row.polarity), weight: Number(row.weight),
      state: String(row.state), note: String(row.note ?? ""), evidence,
    };
  });
}

function graphNodeTitle(db: DatabaseSync, kind: string, id: string): string {
  if (kind === "source") {
    const [source, refId] = id.split(":");
    return graphNodeTitle(db, source ?? "", refId ?? "");
  }
  const queries: Record<string, { sql: string; href?: string }> = {
    journal: { sql: "SELECT COALESCE(title, 'Journal entry') AS title FROM journal_entries WHERE id = ?" },
    note: { sql: "SELECT title FROM notes WHERE id = ?" },
    idea: { sql: "SELECT title FROM ideas WHERE id = ?" },
    project: { sql: "SELECT name AS title FROM projects WHERE id = ?" },
    project_item: { sql: "SELECT title FROM project_items WHERE id = ?" },
    task: { sql: "SELECT title FROM tasks WHERE id = ?" },
    goal: { sql: "SELECT title FROM goals WHERE id = ?" },
    insight: { sql: "SELECT text AS title FROM dreamer_insights WHERE id = ?" },
    suggestion: { sql: "SELECT title FROM dreamer_suggestions WHERE id = ?" },
  };
  const query = queries[kind];
  if (!query) return `${kind} ${id}`;
  const row = db.prepare(query.sql).get(id) as { title: string | null } | undefined;
  return row?.title ?? `${kind} ${id}`;
}

export function listBriefs(db: DatabaseSync, kind: "daily" | "weekly") {
  return db.prepare(`SELECT id, period_key, body_md, created_at FROM dreamer_briefs
    WHERE kind = ? ORDER BY period_key DESC, id DESC LIMIT 12`).all(kind) as { id: number; period_key: string; body_md: string; created_at: string }[];
}

export function latestRun(db: DatabaseSync, kind: "daily" | "weekly") {
  return db.prepare(`SELECT id, kind, period_key, started_at, finished_at, ok, new_insights, new_suggestions, notes
    FROM dreamer_runs WHERE kind = ? ORDER BY period_key DESC, id DESC LIMIT 1`).get(kind) as
    | { id: number; kind: string; period_key: string; started_at: string; finished_at: string | null; ok: number; new_insights: number; new_suggestions: number; notes: string | null }
    | undefined;
}

export function dailyBrief(db: DatabaseSync, periodKey = todayStr()): string | null {
  const row = db.prepare("SELECT body_md FROM dreamer_briefs WHERE kind = 'daily' AND period_key = ?").get(periodKey) as { body_md: string } | undefined;
  return row?.body_md ?? null;
}

export function getSourcesPrivacy(db: DatabaseSync) {
  const values = getVisibleCategoriesAndTags(db);
  const consent = getConsent(db, "dreamer");
  const status = getAiStatus(db);
  const sources = (["journal", "note", "idea"] as const).map((source) => ({ source, enabled: getSourceSetting(db, source) }));
  const entries = db.prepare(`SELECT source, ref_id, enabled FROM dreamer_sources WHERE enabled = 0 ORDER BY source, ref_id`).all() as { source: DreamerSource; ref_id: string; enabled: number }[];
  return {
    sources, entries, categories: values.categories, tags: values.tags,
    excludedCategories: getExcludedValues(db, "categories"), excludedTags: getExcludedValues(db, "tags"),
    consent, aiStatus: status,
  };
}

export function isEntryEnabled(db: DatabaseSync, source: DreamerSource, refId: string): boolean {
  const row = db.prepare("SELECT enabled FROM dreamer_sources WHERE source = ? AND ref_id = ?").get(source, refId) as { enabled: number } | undefined;
  return row?.enabled !== 0;
}

export function listSourceRecords(db: DatabaseSync) {
  const rows = [
    ...(db.prepare("SELECT id, title, date AS source_date, tags, 'journal' AS source FROM journal_entries ORDER BY date DESC, id DESC LIMIT 50").all() as Row[]),
    ...(db.prepare("SELECT id, title, updated_at AS source_date, tags, 'note' AS source FROM notes ORDER BY updated_at DESC, id DESC LIMIT 50").all() as Row[]),
    ...(db.prepare("SELECT id, title, updated_at AS source_date, tags, 'idea' AS source FROM ideas ORDER BY updated_at DESC, id DESC LIMIT 50").all() as Row[]),
  ];
  return rows.map((row) => {
    const source = String(row.source) as DreamerSource;
    const refId = String(row.id);
    return { source, refId, title: String(row.title || `${source} ${refId}`), date: String(row.source_date ?? "").slice(0, 10), enabled: isEntryEnabled(db, source, refId), href: sourceHref(source, refId) };
  }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100);
}

/** The exact redacted, bounded evidence list shown before a Layer-B request. */
export function getAiDisclosurePreview(db: DatabaseSync, evidenceIds?: readonly string[]) {
  const consent = getConsent(db, "dreamer");
  const status = getAiStatus(db);
  const excludedSources = (["journal", "note", "idea"] as const).filter((source) => !getSourceSetting(db, source));
  const idClause = evidenceIds ? ` AND e.id IN (${evidenceIds.map(() => "?").join(",") || "NULL"})` : "";
  const rows = db.prepare(`SELECT e.id, e.source, e.ref_id, e.date, e.quote
    FROM dreamer_evidence e JOIN dreamer_documents d ON d.id = e.document_id
    LEFT JOIN dreamer_sources s ON s.source = e.source AND s.ref_id = e.ref_id
    WHERE d.status = 'processed' AND COALESCE(s.enabled, 1) = 1${idClause}
    ORDER BY e.date DESC, e.id DESC ${evidenceIds ? "" : "LIMIT 8"}`).all(...(evidenceIds ?? [])) as Row[];
  const maxChars = Math.max(80, Math.min(1000, consent.scope.maxExcerptChars || 280));
  const items = rows.filter((row) => !excludedSources.includes(String(row.source) as DreamerSource)).map((row) => ({
    id: String(row.id), label: `${String(row.date)} · ${String(row.source)} #${String(row.ref_id)}`,
    text: redactForAi(String(row.quote), maxChars),
  })).filter((item) => item.text.length > 0);
  const model = consent.model || status.defaultModel || "configured model";
  return buildDisclosure("dreamer", "Refine local recurring-theme hypotheses", model, items);
}

export function getSuggestionCount(db: DatabaseSync): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM dreamer_suggestions WHERE state NOT IN ('not_relevant', 'dont_suggest_again', 'already_implemented')").get() as { n: number };
  return Number(row.n);
}
