import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { todayStr } from "@/lib/dates";
import { confidenceScore, detectCandidates, normalizeSignature, sentences, termSimilarity, tokenize } from "./text";
import type { DreamerSource, SourceDocument } from "./types";
import { pruneGraphEvidence, rebuildDreamerGraph } from "./graph";

type DbRow = Record<string, string | number | null>;
type ProjectRow = { id: number; name: string; tags: string | null; tech_stack: string | null; status: string | null };
type EvidenceRow = { id: number; document_id: number; source: DreamerSource; ref_id: string; kind: string; quote: string; date: string; polarity: number };

const asString = (value: unknown): string => (typeof value === "string" ? value : "");
const safeDay = (value: unknown, fallback: string): string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : fallback;
const cleanList = (value: string | null): string[] =>
  (value ?? "").split(/[;,]/).map((part) => part.trim().toLowerCase()).filter(Boolean);

function getSetting(db: DatabaseSync, key: string, fallback: string): string {
  const row = db.prepare("SELECT value FROM dreamer_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare(`INSERT INTO dreamer_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

export function getSourceSetting(db: DatabaseSync, source: DreamerSource): boolean {
  return getSetting(db, `source:${source}`, "1") === "1";
}

export function setSourceSetting(db: DatabaseSync, source: DreamerSource, enabled: boolean): void {
  setSetting(db, `source:${source}`, enabled ? "1" : "0");
  if (!enabled) {
    const docs = db.prepare("SELECT ref_id FROM dreamer_documents WHERE source = ?").all(source) as { ref_id: string }[];
    for (const row of docs) purgeSourceEntry(db, source, row.ref_id);
  }
}

export function getExcludedValues(db: DatabaseSync, key: "tags" | "categories"): string[] {
  try {
    const value: unknown = JSON.parse(getSetting(db, `excluded_${key}`, "[]"));
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function setExcludedValues(db: DatabaseSync, key: "tags" | "categories", values: readonly string[]): void {
  setSetting(db, `excluded_${key}`, JSON.stringify([...new Set(values.map((item) => item.trim().toLowerCase()).filter(Boolean))]));
  purgeExcludedDocuments(db);
}

function loadSourceDocuments(db: DatabaseSync, fallbackDate: string): SourceDocument[] {
  const journal = db.prepare(`SELECT id, date, title, tags, text FROM journal_entries`).all() as DbRow[];
  const notes = db.prepare(`SELECT id, updated_at, created_at, title, kind, tags, body FROM notes`).all() as DbRow[];
  const ideas = db.prepare(`SELECT id, updated_at, created_at, title, category, tags, body, notes FROM ideas`).all() as DbRow[];
  return [
    ...journal.map((row): SourceDocument => ({
      source: "journal", refId: String(row.id), title: asString(row.title), category: "Journal",
      tags: cleanList(asString(row.tags)), date: safeDay(row.date, fallbackDate),
      content: [asString(row.title), asString(row.win), asString(row.setback), asString(row.text)].filter(Boolean).join("\n\n"),
    })),
    ...notes.map((row): SourceDocument => ({
      source: "note", refId: String(row.id), title: asString(row.title), category: asString(row.kind) || "Note",
      tags: cleanList(asString(row.tags)), date: safeDay(row.updated_at ?? row.created_at, fallbackDate),
      content: [asString(row.title), asString(row.body)].filter(Boolean).join("\n\n"),
    })),
    ...ideas.map((row): SourceDocument => ({
      source: "idea", refId: String(row.id), title: asString(row.title), category: asString(row.category) || "Idea",
      tags: cleanList(asString(row.tags)), date: safeDay(row.updated_at ?? row.created_at, fallbackDate),
      content: [asString(row.title), asString(row.body), asString(row.notes)].filter(Boolean).join("\n\n"),
    })),
  ];
}

function isEntryEnabled(db: DatabaseSync, document: SourceDocument): boolean {
  const row = db.prepare("SELECT enabled FROM dreamer_sources WHERE source = ? AND ref_id = ?").get(document.source, document.refId) as { enabled: number } | undefined;
  return row?.enabled !== 0;
}

function isExcluded(db: DatabaseSync, document: SourceDocument): boolean {
  if (!getSourceSetting(db, document.source) || !isEntryEnabled(db, document)) return true;
  const tags = new Set(getExcludedValues(db, "tags"));
  const categories = new Set(getExcludedValues(db, "categories"));
  return categories.has(document.category.toLowerCase()) || document.tags.some((tag) => tags.has(tag));
}

function hashDocument(document: SourceDocument): string {
  return createHash("sha256").update(JSON.stringify([
    document.title, document.category, document.tags, document.date, document.content,
  ])).digest("hex");
}

function purgeSourceEntry(db: DatabaseSync, source: DreamerSource, refId: string): void {
  const existed = db.prepare("SELECT 1 FROM dreamer_documents WHERE source = ? AND ref_id = ?").get(source, refId);
  db.prepare("DELETE FROM dreamer_documents WHERE source = ? AND ref_id = ?").run(source, refId);
  db.prepare("DELETE FROM dreamer_links WHERE from_kind = ? AND from_id = ?").run("source", `${source}:${refId}`);
  pruneGraphEvidence(db);
  if (existed) db.prepare("DELETE FROM dreamer_briefs").run();
  pruneOrphans(db);
}

function pruneOrphans(db: DatabaseSync): void {
  db.prepare(`DELETE FROM dreamer_insights WHERE NOT EXISTS (
    SELECT 1 FROM dreamer_insight_evidence ie WHERE ie.insight_id = dreamer_insights.id
  )`).run();
  db.prepare(`DELETE FROM dreamer_suggestions WHERE NOT EXISTS (
    SELECT 1 FROM dreamer_suggestion_evidence se WHERE se.suggestion_id = dreamer_suggestions.id
  )`).run();
  refreshInsightScores(db, new Date());
}

function purgeExcludedDocuments(db: DatabaseSync): void {
  const documents = loadSourceDocuments(db, todayStr());
  const current = new Set(documents.map((doc) => `${doc.source}:${doc.refId}`));
  const saved = db.prepare("SELECT source, ref_id FROM dreamer_documents").all() as { source: DreamerSource; ref_id: string }[];
  for (const row of saved) {
    const document = documents.find((item) => item.source === row.source && item.refId === row.ref_id);
    if (!current.has(`${row.source}:${row.ref_id}`) || !document || isExcluded(db, document)) purgeSourceEntry(db, row.source, row.ref_id);
  }
}

function evidenceQuote(text: string, start: number, end: number): { quote: string; start: number; end: number } {
  const sourceText = text.slice(start, end);
  const clipped = sourceText.slice(0, 200);
  return { quote: clipped, start, end: start + clipped.length };
}

function addEvidence(
  db: DatabaseSync,
  documentId: number,
  document: SourceDocument,
  kind: string,
  quoteText: string,
  start: number,
  end: number,
  polarity: number,
): number {
  const quote = evidenceQuote(quoteText, start, end);
  const result = db.prepare(`INSERT INTO dreamer_evidence
    (document_id, kind, source, ref_id, quote, start, end, date, polarity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(documentId, kind, document.source, document.refId, quote.quote, quote.start, quote.end, document.date, polarity);
  return Number(result.lastInsertRowid);
}

function ensureInsight(
  db: DatabaseSync,
  input: { kind: string; signature: string; text: string; evidenceId: number; now: string },
): boolean {
  const result = db.prepare(`INSERT OR IGNORE INTO dreamer_insights
    (kind, signature, text, original_text, confidence, uncertainty_note, first_detected, last_confirmed, review_state, origin)
    VALUES (?, ?, ?, ?, 0.25, 'Rule-based hypothesis; review the supporting excerpts.', ?, ?, 'new', 'rule')`)
    .run(input.kind, input.signature, input.text, input.text, input.now, input.now);
  const row = db.prepare("SELECT id FROM dreamer_insights WHERE signature = ?").get(input.signature) as { id: number } | undefined;
  if (!row) return false;
  db.prepare("INSERT OR IGNORE INTO dreamer_insight_evidence (insight_id, evidence_id) VALUES (?, ?)").run(row.id, input.evidenceId);
  db.prepare("UPDATE dreamer_insights SET last_confirmed = ? WHERE id = ?").run(input.now, row.id);
  return Number(result.changes) > 0;
}

function processDocument(db: DatabaseSync, documentId: number, document: SourceDocument, now: string): number {
  let newInsights = 0;
  for (const candidate of detectCandidates(document.content)) {
    const evidenceId = addEvidence(db, documentId, document, candidate.kind, document.content,
      candidate.sentence.start, candidate.sentence.end, candidate.polarity);
    const signature = `${candidate.kind}:${normalizeSignature(candidate.sentence.text)}`;
    if (ensureInsight(db, { kind: candidate.kind, signature, text: candidate.text, evidenceId, now })) newInsights++;
  }

  const tokens = tokenize(document.content);
  const firstByTerm = new Map<string, (typeof tokens)[number]>();
  for (const token of tokens) if (!firstByTerm.has(token.term)) firstByTerm.set(token.term, token);
  const slices = sentences(document.content);
  for (const [term, token] of firstByTerm) {
    const sentence = slices.find((item) => token.start >= item.start && token.start < item.end);
    if (!sentence) continue;
    const polarity = /\b(no longer|don't|do not|never|stopped|not)\b/i.test(sentence.text) ? -1 : 1;
    const evidenceId = addEvidence(db, documentId, document, "theme", document.content, sentence.start, sentence.end, polarity);
    db.prepare("INSERT OR IGNORE INTO dreamer_terms (document_id, evidence_id, term) VALUES (?, ?, ?)").run(documentId, evidenceId, term);
  }
  return newInsights;
}

function rollingStart(date: string): string {
  const start = new Date(`${date}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 89);
  return start.toISOString().slice(0, 10);
}

function updateTfidf(db: DatabaseSync, cutoff: string): void {
  db.prepare("UPDATE dreamer_terms SET tfidf = 0").run();
  const docs = db.prepare(`SELECT t.document_id AS id, COUNT(*) AS n FROM dreamer_terms t
    JOIN dreamer_evidence e ON e.id = t.evidence_id WHERE e.date >= ? GROUP BY t.document_id`).all(cutoff) as { id: number; n: number }[];
  const total = Math.max(1, docs.length);
  const dfs = db.prepare(`SELECT t.term, COUNT(DISTINCT t.document_id) AS n FROM dreamer_terms t
    JOIN dreamer_evidence e ON e.id = t.evidence_id WHERE e.date >= ? GROUP BY t.term`).all(cutoff) as { term: string; n: number }[];
  const df = new Map(dfs.map((row) => [row.term, row.n]));
  const update = db.prepare("UPDATE dreamer_terms SET tfidf = ? WHERE document_id = ? AND term = ?");
  for (const doc of docs) {
    const terms = db.prepare(`SELECT t.term FROM dreamer_terms t JOIN dreamer_evidence e ON e.id = t.evidence_id
      WHERE t.document_id = ? AND e.date >= ?`).all(doc.id, cutoff) as { term: string }[];
    for (const item of terms) {
      const idf = Math.log((total + 1) / ((df.get(item.term) ?? 0) + 1)) + 1;
      update.run((1 / Math.max(1, doc.n)) * idf, doc.id, item.term);
    }
  }
}

function rebuildThemeInsights(db: DatabaseSync, now: string): number {
  const cutoff = rollingStart(now);
  const rows = db.prepare(`SELECT t.term, e.id AS evidence_id, e.date, e.polarity
    FROM dreamer_terms t JOIN dreamer_evidence e ON e.id = t.evidence_id
    WHERE e.date >= ?
    ORDER BY t.tfidf DESC`).all(cutoff) as { term: string; evidence_id: number; date: string; polarity: number }[];
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) grouped.set(row.term, [...(grouped.get(row.term) ?? []), row]);
  let created = 0;
  for (const [term, evidence] of grouped) {
    const dates = new Set(evidence.map((item) => item.date));
    if (dates.size < 2) continue;
    const signature = `theme:${term}`;
    const first = evidence.slice(0, 1)[0];
    if (ensureInsight(db, { kind: "recurring_theme", signature, text: `Recurring theme may include “${term}”.`, evidenceId: first.evidence_id, now })) created++;
    const insight = db.prepare("SELECT id FROM dreamer_insights WHERE signature = ?").get(signature) as { id: number };
    const add = db.prepare("INSERT OR IGNORE INTO dreamer_insight_evidence (insight_id, evidence_id) VALUES (?, ?)");
    for (const item of evidence.slice(1, 12)) add.run(insight.id, item.evidence_id);
    const detail = evidence.slice(0, 12).map((item) => ({ date: item.date, polarity: item.polarity }));
    db.prepare("UPDATE dreamer_insights SET confidence = ?, last_confirmed = ? WHERE id = ?")
      .run(confidenceScore(detail, new Date(`${now}T00:00:00Z`)), now, insight.id);
  }

  // Term co-occurrence is measured per document over the same rolling window.
  // A pair only becomes a theme when it appears together on at least two dates.
  const termRows = db.prepare(`SELECT t.document_id, t.term, t.tfidf, e.id AS evidence_id, e.date, e.polarity
    FROM dreamer_terms t JOIN dreamer_evidence e ON e.id = t.evidence_id
    WHERE e.date >= ? ORDER BY t.document_id, t.tfidf DESC`).all(cutoff) as
    { document_id: number; term: string; tfidf: number; evidence_id: number; date: string; polarity: number }[];
  const byDocument = new Map<number, typeof termRows>();
  for (const row of termRows) byDocument.set(row.document_id, [...(byDocument.get(row.document_id) ?? []), row]);
  const pairs = new Map<string, typeof termRows>();
  for (const items of byDocument.values()) {
    const top = items.slice(0, 12);
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
      const key = [top[i].term, top[j].term].sort().join("+");
      pairs.set(key, [...(pairs.get(key) ?? []), top[i], top[j]]);
    }
  }
  for (const [pair, pairRows] of pairs) {
    const docsForPair = new Map<number, typeof termRows>();
    for (const row of pairRows) docsForPair.set(row.document_id, [...(docsForPair.get(row.document_id) ?? []), row]);
    const uniqueDocs = [...docsForPair.values()].filter((items) => new Set(items.map((item) => item.term)).size === 2);
    const dates = new Set(uniqueDocs.flatMap((items) => items.map((item) => item.date)));
    if (dates.size < 2) continue;
    const parts = pair.split("+");
    const signature = `theme-pair:${pair}`;
    const allEvidence = uniqueDocs.map((items) => items[0]);
    if (allEvidence.length === 0) continue;
    if (ensureInsight(db, { kind: "recurring_theme", signature, text: `Recurring theme may connect “${parts[0]}” and “${parts[1]}”.`, evidenceId: allEvidence[0].evidence_id, now })) created++;
    const insight = db.prepare("SELECT id FROM dreamer_insights WHERE signature = ?").get(signature) as { id: number };
    const add = db.prepare("INSERT OR IGNORE INTO dreamer_insight_evidence (insight_id, evidence_id) VALUES (?, ?)");
    for (const row of allEvidence.slice(1, 10)) add.run(insight.id, row.evidence_id);
    const detail = allEvidence.slice(0, 10).map((item) => ({ date: item.date, polarity: item.polarity }));
    db.prepare("UPDATE dreamer_insights SET confidence = ?, last_confirmed = ? WHERE id = ?")
      .run(confidenceScore(detail, new Date(`${now}T00:00:00Z`)), now, insight.id);
  }
  return created;
}

function refreshInsightScores(db: DatabaseSync, now: Date): void {
  const insights = db.prepare("SELECT id FROM dreamer_insights").all() as { id: number }[];
  const query = db.prepare(`SELECT e.date, e.polarity FROM dreamer_insight_evidence ie
    JOIN dreamer_evidence e ON e.id = ie.evidence_id WHERE ie.insight_id = ?`);
  for (const insight of insights) {
    const evidence = query.all(insight.id) as { date: string; polarity: number }[];
    db.prepare("UPDATE dreamer_insights SET confidence = ? WHERE id = ?").run(confidenceScore(evidence, now), insight.id);
  }
}

type NamedRow = { id: number; name: string; tags?: string | null; tech_stack?: string | null };
function matchScore(content: string, candidate: string): number {
  const phrase = candidate.trim().toLowerCase();
  if (phrase.length > 2 && content.toLowerCase().includes(phrase)) return 1;
  const a = new Set(tokenize(content).map((item) => item.term));
  const b = new Set(tokenize(candidate).map((item) => item.term));
  if (b.size === 0) return 0;
  let overlap = 0;
  for (const token of b) if (a.has(token)) overlap++;
  return overlap / b.size;
}

function linkEntities(db: DatabaseSync, document: SourceDocument, content: string): number[] {
  const entityRows: { kind: string; rows: NamedRow[] }[] = [
    { kind: "project", rows: db.prepare("SELECT id, name, tags, tech_stack FROM projects WHERE archived = 0").all() as NamedRow[] },
    { kind: "goal", rows: db.prepare("SELECT id, title AS name FROM goals WHERE status IN ('Active', 'Paused')").all() as NamedRow[] },
    { kind: "task", rows: db.prepare("SELECT id, title AS name FROM tasks WHERE status != 'Done'").all() as NamedRow[] },
    { kind: "idea", rows: db.prepare("SELECT id, title AS name, tags FROM ideas WHERE archived = 0").all() as NamedRow[] },
  ];
  const evidence = db.prepare("SELECT id, polarity FROM dreamer_evidence WHERE source = ? AND ref_id = ?")
    .all(document.source, document.refId) as { id: number; polarity: number }[];
  const evidenceIds = evidence.map((item) => item.id).slice(0, 12);
  const positiveEvidence = evidence.filter((item) => item.polarity >= 0).map((item) => item.id).slice(0, 12);
  const negativeEvidence = evidence.filter((item) => item.polarity < 0).map((item) => item.id).slice(0, 12);
  if (evidenceIds.length === 0) return [];
  const projects: number[] = [];
  for (const group of entityRows) {
    for (const entity of group.rows) {
      const searchable = group.kind === "project"
        ? [entity.name, entity.tags ?? "", entity.tech_stack ?? ""].join(" ")
        : [entity.name, entity.tags ?? ""].join(" ");
      const score = matchScore(content, searchable);
      if (score < 0.5) continue;
      const toId = Number(entity.id);
      const fromId = `${document.source}:${document.refId}`;
      if (positiveEvidence.length) db.prepare(`INSERT INTO dreamer_links (from_kind, from_id, to_kind, to_id, relation, polarity, weight, evidence_json)
        VALUES ('source', ?, ?, ?, 'mentions', 1, ?, ?)
        ON CONFLICT(from_kind, from_id, to_kind, to_id, relation) DO UPDATE SET weight = excluded.weight, evidence_json = excluded.evidence_json`)
        .run(fromId, group.kind, String(toId), score, JSON.stringify(positiveEvidence));
      if (negativeEvidence.length) db.prepare(`INSERT INTO dreamer_links (from_kind, from_id, to_kind, to_id, relation, polarity, weight, evidence_json)
        VALUES ('source', ?, ?, ?, 'contradicts', -1, ?, ?)
        ON CONFLICT(from_kind, from_id, to_kind, to_id, relation) DO UPDATE SET weight = excluded.weight, evidence_json = excluded.evidence_json`)
        .run(fromId, group.kind, String(toId), score, JSON.stringify(negativeEvidence));
      if (group.kind === "project") projects.push(toId);
    }
  }
  const sourceEvidence = db.prepare(`SELECT ie.insight_id, e.id AS evidence_id
    FROM dreamer_insight_evidence ie JOIN dreamer_evidence e ON e.id = ie.evidence_id
    WHERE e.source = ? AND e.ref_id = ?`).all(document.source, document.refId) as { insight_id: number; evidence_id: number }[];
  const link = db.prepare("INSERT OR IGNORE INTO dreamer_insight_projects (insight_id, project_id) VALUES (?, ?)");
  for (const item of sourceEvidence) for (const projectId of projects) link.run(item.insight_id, projectId);
  return projects;
}

function relevantProjectNames(db: DatabaseSync, evidenceIds: readonly number[]): ProjectRow[] {
  if (evidenceIds.length === 0) return [];
  const rows = db.prepare(`SELECT DISTINCT p.id, p.name, p.tags, p.tech_stack, p.status
    FROM dreamer_links l JOIN projects p ON p.id = CAST(l.to_id AS INTEGER)
    WHERE l.from_kind = 'source' AND l.to_kind = 'project'
      AND EXISTS (SELECT 1 FROM json_each(l.evidence_json) e WHERE CAST(e.value AS INTEGER) IN (${evidenceIds.map(() => "?").join(",")}))`)
    .all(...evidenceIds) as ProjectRow[];
  return rows;
}

function createSuggestions(db: DatabaseSync, cycleId: number, now: string): number {
  const problemEvidence = db.prepare(`SELECT e.id, e.document_id, e.source, e.ref_id, e.quote, e.date, e.polarity
    FROM dreamer_evidence e WHERE e.kind IN ('problem', 'improvement') AND e.date >= ?
      AND NOT EXISTS (SELECT 1 FROM dreamer_insight_evidence ie JOIN dreamer_insights i ON i.id = ie.insight_id
        WHERE ie.evidence_id = e.id AND i.review_state = 'blocked')
    ORDER BY e.date DESC`).all(rollingStart(now)) as EvidenceRow[];
  const byTerm = new Map<string, EvidenceRow[]>();
  const ignored = new Set(["stuck", "annoy", "frustrat", "slow", "problem", "struggl", "keep", "get", "make", "thing", "work", "cannot", "feel"]);
  for (const evidence of problemEvidence) {
    const terms = new Set(tokenize(evidence.quote).map((item) => item.term));
    for (const term of terms) {
      if (ignored.has(term)) continue;
      byTerm.set(term, [...(byTerm.get(term) ?? []), evidence]);
    }
  }
  const candidates = [...byTerm.entries()].map(([term, rows]) => ({
    term, rows,
    dates: new Set(rows.map((item) => item.date)),
  })).filter((item) => item.dates.size >= 2)
    .sort((a, b) => b.dates.size - a.dates.size || b.rows.length - a.rows.length);
  const previous = db.prepare("SELECT signature, title, problem, state FROM dreamer_suggestions").all() as { signature: string; title: string; problem: string; state: string }[];
  let created = 0;
  for (const candidate of candidates) {
    if (created >= 2) break;
    const signature = `workflow:${candidate.term}`;
    const title = `Reduce repeated friction around “${candidate.term}”`;
    const problem = `The journal and notes contain repeated friction mentioning “${candidate.term}” on ${candidate.dates.size} separate dates.`;
    if (previous.some((item) => termSimilarity(`${item.signature} ${item.title} ${item.problem}`, `${signature} ${title} ${problem}`) >= 0.68)) continue;
    const chosen = [...candidate.rows].sort((a, b) => b.date.localeCompare(a.date)).filter((row, index, all) => all.findIndex((other) => other.date === row.date) === index).slice(0, 6);
    const evidenceIds = chosen.map((row) => row.id);
    const projects = relevantProjectNames(db, evidenceIds);
    const projectNames = projects.map((project) => project.name);
    const dependencyParts: string[] = [];
    if (projectNames.length) dependencyParts.push(`Could reuse ${projects.map((project) => `${project.name}${project.tech_stack ? ` (recorded stack: ${project.tech_stack})` : project.tags ? ` (recorded tags: ${project.tags})` : ""}`).join(", ")}.`);
    const openWork = db.prepare("SELECT title FROM tasks WHERE status != 'Done' ORDER BY due IS NULL, due LIMIT 30").all() as { title: string }[];
    const relatedTasks = openWork.filter((task) => termSimilarity(task.title, candidate.term) >= 0.3).slice(0, 3).map((task) => task.title);
    if (relatedTasks.length) dependencyParts.push(`Related unfinished tasks: ${relatedTasks.join(", ")}.`);
    const relatedGoals = (db.prepare("SELECT title FROM goals WHERE status IN ('Active', 'Paused')").all() as { title: string }[])
      .filter((goal) => termSimilarity(goal.title, candidate.term) >= 0.3).slice(0, 3).map((goal) => goal.title);
    if (relatedGoals.length) dependencyParts.push(`Related active goals: ${relatedGoals.join(", ")}.`);
    const relatedIdeas = (db.prepare("SELECT title, tags FROM ideas WHERE archived = 0").all() as { title: string; tags: string | null }[])
      .filter((idea) => termSimilarity(`${idea.title} ${idea.tags ?? ""}`, candidate.term) >= 0.3).slice(0, 3).map((idea) => idea.title);
    if (relatedIdeas.length) dependencyParts.push(`Prior Idea Vault captures to compare: ${relatedIdeas.join(", ")}.`);
    const supportingText = chosen.map((item) => item.quote.toLowerCase()).join(" ");
    const recordedDevices = (db.prepare("SELECT name, kind, os FROM devices").all() as { name: string; kind: string | null; os: string | null }[])
      .filter((device) => [device.name, device.kind, device.os].some((value) => value && value.length > 2 && supportingText.includes(value.toLowerCase())))
      .map((device) => device.name).slice(0, 3);
    if (recordedDevices.length) dependencyParts.push(`Hardware mentioned in the supporting excerpts: ${recordedDevices.join(", ")}.`);
    const dependencies = dependencyParts.length ? dependencyParts.join(" ") : "No project, goal, task, prior idea or device dependency is supported by the current evidence.";
    const result = db.prepare(`INSERT OR IGNORE INTO dreamer_suggestions
      (signature, title, problem, why_it_matters, usefulness, difficulty, dependencies, prototype, next_steps, uncertainties, origin, state, cycle_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rule', 'new', ?)`)
      .run(signature, title, problem,
        `The same friction appears on ${[...candidate.dates].sort().join(" and ")}; a small workflow change may make this repeated work easier.`,
        "A lightweight checklist or saved workflow could reduce repeated setup and make the next step easier to resume.",
        "Small; a short experiment, no new software assumed.", dependencies,
        `For one week, write a 3-step local checklist for work involving “${candidate.term}” and see whether it removes the repeated friction.`,
        "1. Capture the current steps.\n2. Remove or clarify one repeated step.\n3. Review after a week and keep it only if it helped.",
        "The excerpts do not establish the cause of the friction or whether a checklist will help. Treat this as a hypothesis.", cycleId);
    if (Number(result.changes) === 0) continue;
    const suggestionId = Number(result.lastInsertRowid);
    const addEvidence = db.prepare("INSERT OR IGNORE INTO dreamer_suggestion_evidence (suggestion_id, evidence_id) VALUES (?, ?)");
    for (const id of evidenceIds) addEvidence.run(suggestionId, id);
    const addProject = db.prepare("INSERT OR IGNORE INTO dreamer_suggestion_projects (suggestion_id, project_id) VALUES (?, ?)");
    for (const project of projects) addProject.run(suggestionId, project.id);
    created++;
  }
  return created;
}

export type IngestResult = { processed: number; unchanged: number; newInsights: number; newSuggestions: number };

/** Local-only baseline. It never calls an external service or changes source rows. */
export function analyzeSources(db: DatabaseSync, cycleId: number, now = new Date()): IngestResult {
  const date = todayStr();
  const docs = loadSourceDocuments(db, date);
  const present = new Set(docs.map((doc) => `${doc.source}:${doc.refId}`));
  const existing = db.prepare("SELECT source, ref_id FROM dreamer_documents").all() as { source: DreamerSource; ref_id: string }[];
  for (const row of existing) if (!present.has(`${row.source}:${row.ref_id}`)) purgeSourceEntry(db, row.source, row.ref_id);

  let processed = 0;
  let unchanged = 0;
  let newInsights = 0;
  const nowDay = safeDay(now.toISOString(), date);
  for (const document of docs) {
    if (isExcluded(db, document)) {
      purgeSourceEntry(db, document.source, document.refId);
      continue;
    }
    const hash = hashDocument(document);
    const current = db.prepare("SELECT id, content_hash FROM dreamer_documents WHERE source = ? AND ref_id = ?")
      .get(document.source, document.refId) as { id: number; content_hash: string } | undefined;
    if (current?.content_hash === hash) {
      linkEntities(db, document, document.content);
      unchanged++;
      continue;
    }
    if (current) purgeSourceEntry(db, document.source, document.refId);
    const inserted = db.prepare(`INSERT INTO dreamer_documents (source, ref_id, content_hash, processed_at, status)
      VALUES (?, ?, ?, ?, 'processed')`).run(document.source, document.refId, hash, now.toISOString());
    const documentId = Number(inserted.lastInsertRowid);
    newInsights += processDocument(db, documentId, document, nowDay);
    linkEntities(db, document, document.content);
    processed++;
  }

  updateTfidf(db, rollingStart(nowDay));
  newInsights += rebuildThemeInsights(db, nowDay);
  refreshInsightScores(db, now);
  const newSuggestions = createSuggestions(db, cycleId, nowDay);
  rebuildDreamerGraph(db);
  return { processed, unchanged, newInsights, newSuggestions };
}

/** Purges every derived row attributable only to a source entry; shared memories keep remaining evidence. */
export function removeSourceData(db: DatabaseSync, source: DreamerSource, refId: string): void {
  db.prepare(`INSERT INTO dreamer_sources (source, ref_id, enabled) VALUES (?, ?, 0)
    ON CONFLICT(source, ref_id) DO UPDATE SET enabled = 0, updated_at = datetime('now')`).run(source, refId);
  purgeSourceEntry(db, source, refId);
}

export function setEntryEnabled(db: DatabaseSync, source: DreamerSource, refId: string, enabled: boolean): void {
  db.prepare(`INSERT INTO dreamer_sources (source, ref_id, enabled) VALUES (?, ?, ?)
    ON CONFLICT(source, ref_id) DO UPDATE SET enabled = excluded.enabled, updated_at = datetime('now')`)
    .run(source, refId, enabled ? 1 : 0);
  if (!enabled) purgeSourceEntry(db, source, refId);
}

export function recordSuggestionFeedback(db: DatabaseSync, suggestionId: number, choice: string, note: string | null = null, at = new Date().toISOString()): boolean {
  const allowed = new Set(["useful", "save_later", "explore", "convert_to_project", "already_implemented", "not_relevant", "dont_suggest_again"]);
  if (!Number.isInteger(suggestionId) || suggestionId <= 0 || !allowed.has(choice)) return false;
  const exists = db.prepare("SELECT id FROM dreamer_suggestions WHERE id = ?").get(suggestionId);
  if (!exists) return false;
  db.prepare("INSERT INTO dreamer_feedback (suggestion_id, choice, note, at) VALUES (?, ?, ?, ?)")
    .run(suggestionId, choice, note?.slice(0, 1000) ?? null, at);
  db.prepare("UPDATE dreamer_suggestions SET state = ? WHERE id = ?").run(choice, suggestionId);
  return true;
}

export function getVisibleCategoriesAndTags(db: DatabaseSync): { categories: string[]; tags: string[] } {
  const docs = loadSourceDocuments(db, todayStr());
  return {
    categories: [...new Set(docs.map((doc) => doc.category))].sort(),
    tags: [...new Set(docs.flatMap((doc) => doc.tags))].sort(),
  };
}

/** Called after category/tag privacy preferences change to remove any no-longer-permitted analysis. */
export function purgeExcludedNow(db: DatabaseSync): void {
  purgeExcludedDocuments(db);
}
