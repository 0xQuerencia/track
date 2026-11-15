import type { DatabaseSync } from "node:sqlite";
import { termSimilarity } from "./text";

type Edge = { fromKind: string; fromId: string; toKind: string; toId: string; relation: string; evidence: number[]; note?: string };
type EvidenceRow = { id: number; source: string; ref_id: string; date: string; polarity: number };

function addEdge(db: DatabaseSync, edge: Edge, confirmed = false): void {
  const from = `${edge.fromKind}:${edge.fromId}`;
  const to = `${edge.toKind}:${edge.toId}`;
  const reviewed = db.prepare(`SELECT id FROM dreamer_links WHERE from_kind = ? AND from_id = ?
    AND to_kind = ? AND to_id = ? AND state IN ('confirmed', 'rejected') LIMIT 1`).get(edge.fromKind, edge.fromId, edge.toKind, edge.toId);
  if (reviewed) {
    db.prepare("UPDATE dreamer_links SET evidence_json = ? WHERE id = ? AND ? != '[]'")
      .run(JSON.stringify(edge.evidence), (reviewed as { id: number }).id, JSON.stringify(edge.evidence));
    return;
  }
  db.prepare(`INSERT INTO dreamer_links (from_kind, from_id, to_kind, to_id, relation, polarity, weight, state, evidence_json, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(from_kind, from_id, to_kind, to_id, relation) DO UPDATE SET
      polarity = excluded.polarity, weight = excluded.weight, evidence_json = excluded.evidence_json,
      note = COALESCE(excluded.note, dreamer_links.note)`)
    .run(edge.fromKind, edge.fromId, edge.toKind, edge.toId, edge.relation,
      edge.relation === "contradicts" ? -1 : 1, confirmed ? 1 : 0.5,
      confirmed ? "confirmed" : "proposed", JSON.stringify(edge.evidence), edge.note ?? null);
  void from;
  void to;
}

function evidenceForInsight(db: DatabaseSync, id: number): EvidenceRow[] {
  return db.prepare(`SELECT e.id, e.source, e.ref_id, e.date, e.polarity
    FROM dreamer_insight_evidence ie JOIN dreamer_evidence e ON e.id = ie.evidence_id
    WHERE ie.insight_id = ? ORDER BY e.date DESC LIMIT 30`).all(id) as EvidenceRow[];
}

function sourceToInsightEdges(db: DatabaseSync): void {
  const rows = db.prepare(`SELECT i.id AS insight_id, e.id AS evidence_id, e.source, e.ref_id, e.polarity
    FROM dreamer_insight_evidence ie JOIN dreamer_insights i ON i.id = ie.insight_id
    JOIN dreamer_evidence e ON e.id = ie.evidence_id`).all() as
    { insight_id: number; evidence_id: number; source: string; ref_id: string; polarity: number }[];
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const relation = row.polarity < 0 ? "contradicts" : "supports";
    const key = `${row.source}:${row.ref_id}:${row.insight_id}:${relation}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const group of groups.values()) {
    const first = group[0];
    addEdge(db, {
      fromKind: first.source, fromId: first.ref_id, toKind: "insight", toId: String(first.insight_id),
      relation: first.polarity < 0 ? "contradicts" : "supports", evidence: group.map((item) => item.evidence_id).slice(0, 12),
    });
  }
}

function themeToProblemEdges(db: DatabaseSync): void {
  const themes = db.prepare("SELECT id, text FROM dreamer_insights WHERE kind = 'recurring_theme'").all() as { id: number; text: string }[];
  const problems = db.prepare("SELECT id, text FROM dreamer_insights WHERE kind IN ('problem', 'improvement')").all() as { id: number; text: string }[];
  for (const theme of themes) {
    const themeEvidence = evidenceForInsight(db, theme.id);
    for (const problem of problems) {
      const score = termSimilarity(theme.text, problem.text);
      if (score < 0.18) continue;
      const problemEvidence = evidenceForInsight(db, problem.id);
      const themeDates = new Set(themeEvidence.map((item) => item.date));
      const sharedDates = new Set(problemEvidence.filter((item) => themeDates.has(item.date)).map((item) => item.date));
      if (sharedDates.size === 0) continue;
      const evidence = [...new Set([...themeEvidence, ...problemEvidence].filter((item) => sharedDates.has(item.date)).map((item) => item.id))].slice(0, 12);
      addEdge(db, { fromKind: "insight", fromId: String(theme.id), toKind: "insight", toId: String(problem.id), relation: "relates_to", evidence });
    }
  }
}

function insightToIdeaAndSuggestionEdges(db: DatabaseSync): void {
  const problems = db.prepare("SELECT id FROM dreamer_insights WHERE kind IN ('problem', 'improvement')").all() as { id: number }[];
  for (const problem of problems) {
    const evidence = evidenceForInsight(db, problem.id);
    const ids = evidence.map((item) => item.id);
    const sourceKeys = [...new Set(evidence.map((item) => `${item.source}:${item.ref_id}`))];
    for (const key of sourceKeys) {
      const [source, refId] = key.split(":");
      const ideas = db.prepare(`SELECT to_id FROM dreamer_links WHERE from_kind = 'source' AND from_id = ? AND to_kind = 'idea'`).all(key) as { to_id: string }[];
      for (const idea of ideas) addEdge(db, { fromKind: "insight", fromId: String(problem.id), toKind: "idea", toId: idea.to_id, relation: "inspires", evidence: ids });
      void source;
      void refId;
    }
    const suggestions = db.prepare(`SELECT DISTINCT s.id FROM dreamer_suggestions s
      JOIN dreamer_suggestion_evidence se ON se.suggestion_id = s.id
      JOIN dreamer_evidence e ON e.id = se.evidence_id
      WHERE e.id IN (${ids.map(() => "?").join(",") || "NULL"})`).all(...ids) as { id: number }[];
    for (const suggestion of suggestions)
      addEdge(db, { fromKind: "insight", fromId: String(problem.id), toKind: "suggestion", toId: String(suggestion.id), relation: "recommends", evidence: ids });
  }
}

function existingTrackEdges(db: DatabaseSync): void {
  const ideas = db.prepare("SELECT id, project_id FROM ideas WHERE project_id IS NOT NULL AND archived = 0").all() as { id: number; project_id: number }[];
  for (const idea of ideas) addEdge(db, { fromKind: "idea", fromId: String(idea.id), toKind: "project", toId: String(idea.project_id), relation: "converted_to", evidence: [], note: "Existing Idea Vault project link." }, true);

  const items = db.prepare("SELECT id, project_id, title FROM project_items WHERE project_id IS NOT NULL").all() as { id: number; project_id: number; title: string }[];
  for (const item of items) addEdge(db, { fromKind: "project", fromId: String(item.project_id), toKind: "project_item", toId: String(item.id), relation: "has_backlog_item", evidence: [], note: item.title }, true);

  const contributions = db.prepare(`SELECT source_id, goal_id FROM goal_contributions
    WHERE source_type = 'task'`).all() as { source_id: string; goal_id: number }[];
  for (const item of contributions) addEdge(db, { fromKind: "task", fromId: item.source_id, toKind: "goal", toId: String(item.goal_id), relation: "contributes_to", evidence: [], note: "Existing goal contribution." }, true);

  const goals = db.prepare("SELECT id, parent_id FROM goals WHERE parent_id IS NOT NULL").all() as { id: number; parent_id: number }[];
  for (const goal of goals) addEdge(db, { fromKind: "goal", fromId: String(goal.id), toKind: "goal", toId: String(goal.parent_id), relation: "child_of", evidence: [], note: "Existing goal hierarchy." }, true);
}

/** Builds the inspectable Journal → Theme → Problem → Idea → Project → Task → Goal path. */
export function rebuildDreamerGraph(db: DatabaseSync): void {
  sourceToInsightEdges(db);
  themeToProblemEdges(db);
  insightToIdeaAndSuggestionEdges(db);
  existingTrackEdges(db);
}

/** Removes quotes invalidated by source deletion while retaining other graph evidence. */
export function pruneGraphEvidence(db: DatabaseSync): void {
  const links = db.prepare("SELECT id, evidence_json FROM dreamer_links WHERE evidence_json != '[]'").all() as { id: number; evidence_json: string }[];
  for (const link of links) {
    let ids: number[];
    try { ids = JSON.parse(link.evidence_json) as number[]; } catch { db.prepare("DELETE FROM dreamer_links WHERE id = ?").run(link.id); continue; }
    const keep = ids.filter((id) => db.prepare("SELECT 1 FROM dreamer_evidence WHERE id = ?").get(id));
    if (keep.length === 0) db.prepare("DELETE FROM dreamer_links WHERE id = ?").run(link.id);
    else if (keep.length !== ids.length) db.prepare("UPDATE dreamer_links SET evidence_json = ? WHERE id = ?").run(JSON.stringify(keep), link.id);
  }
}
