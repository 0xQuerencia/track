import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { buildDisclosure, type AiConsent, type AiStatus } from "@/lib/ai";
import { closeTestDb, installTestDb } from "@/lib/testing/test-db";
import { analyzeSources, recordSuggestionFeedback, setEntryEnabled, setExcludedValues } from "./engine";
import { runDailyCycle, runWeeklyReflection } from "./cycle";
import { enhanceThemesWithAi, type ChatJsonCaller } from "./layer-b";
import { detectCandidates, termSimilarity } from "./text";
import { seedFakeDreamerSources } from "./testing/fixture";

let db: ReturnType<typeof installTestDb>;
function ensureRun(id: number) {
  db.prepare(`INSERT OR IGNORE INTO dreamer_runs (id, kind, period_key, started_at, ok)
    VALUES (?, 'manual', ?, ?, 1)`).run(id, `test-${id}`, new Date("2026-11-15T12:00:00Z").toISOString());
}

beforeEach(() => { db = installTestDb(); });
afterEach(() => closeTestDb());

describe("Dreamer local baseline", () => {
  it("ingests new/updated source hashes incrementally and never writes back to source tables", () => {
    const fixture = seedFakeDreamerSources(db);
    ensureRun(1);
    const sourceText = db.prepare("SELECT text FROM journal_entries WHERE id = ?").get(fixture.journalIds[0]) as { text: string };
    const first = analyzeSources(db, 1, new Date("2026-11-15T12:00:00Z"));
    assert.equal(first.processed, 4);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM dreamer_documents").get()?.n, 4);
    assert.equal((db.prepare("SELECT text FROM journal_entries WHERE id = ?").get(fixture.journalIds[0]) as { text: string }).text, sourceText.text);

    const again = analyzeSources(db, 1, new Date("2026-11-15T12:00:00Z"));
    assert.equal(again.processed, 0);
    assert.equal(again.unchanged, 4);
    db.prepare("UPDATE notes SET body = body || ' Updated locally.' WHERE id = ?").run(fixture.noteId);
    const updated = analyzeSources(db, 1, new Date("2026-11-15T12:00:00Z"));
    assert.equal(updated.processed, 1);
    assert.equal(updated.unchanged, 3);
    assert.ok(db.prepare("SELECT processed_at FROM dreamer_documents WHERE source = 'note' AND ref_id = ?").get(String(fixture.noteId)));
  });

  it("finds recurring themes across dates and links evidence to existing projects with grounded proposals", async () => {
    const fixture = seedFakeDreamerSources(db);
    const result = await runDailyCycle(db, new Date("2026-11-15T12:00:00Z"));
    const theme = db.prepare(`SELECT i.id FROM dreamer_insights i WHERE i.kind = 'recurring_theme'
      AND i.signature = 'theme:deploy'`).get() as { id: number } | undefined;
    assert.ok(theme, "a repeated term across distinct journal dates becomes a theme");
    const dates = db.prepare(`SELECT COUNT(DISTINCT e.date) AS n FROM dreamer_insight_evidence ie
      JOIN dreamer_evidence e ON e.id = ie.evidence_id WHERE ie.insight_id = ?`).get(theme.id) as { n: number };
    assert.ok(dates.n >= 2);
    assert.ok(db.prepare("SELECT 1 FROM dreamer_links WHERE to_kind = 'project' AND to_id = ?").get(String(fixture.projectId)));
    assert.ok(db.prepare("SELECT 1 FROM dreamer_insight_projects WHERE project_id = ?").get(fixture.projectId));
    const suggestion = db.prepare("SELECT * FROM dreamer_suggestions ORDER BY id LIMIT 1").get() as Record<string, unknown> | undefined;
    assert.ok(suggestion, "repeated problem evidence supports a suggestion");
    for (const field of ["problem", "why_it_matters", "usefulness", "difficulty", "dependencies", "prototype", "next_steps", "uncertainties"])
      assert.ok(String(suggestion[field]).trim(), `${field} is provided`);
    assert.ok(result.newSuggestions >= 1);
    assert.ok(Number((db.prepare("SELECT COUNT(*) AS n FROM dreamer_suggestion_evidence").get() as { n: number }).n) > 0);
    assert.match(String(suggestion.uncertainties), /hypothesis/i);
  });

  it("honors per-entry, tag and deleted-source exclusions by purging derived evidence", () => {
    const fixture = seedFakeDreamerSources(db);
    ensureRun(1);
    analyzeSources(db, 1, new Date("2026-11-15T12:00:00Z"));
    const excludedId = String(fixture.journalIds[0]);
    setEntryEnabled(db, "journal", excludedId, false);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM dreamer_evidence WHERE source = 'journal' AND ref_id = ?").get(excludedId)?.n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM dreamer_documents WHERE source = 'journal' AND ref_id = ?").get(excludedId)?.n, 0);

    setExcludedValues(db, "tags", ["private-test"]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM dreamer_evidence WHERE source = 'note' AND ref_id = ?").get(String(fixture.noteId))?.n, 0);
    db.prepare("DELETE FROM ideas WHERE id = ?").run(fixture.ideaId);
    analyzeSources(db, 2, new Date("2026-11-15T12:00:00Z"));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM dreamer_documents WHERE source = 'idea' AND ref_id = ?").get(String(fixture.ideaId))?.n, 0);
    assert.ok(db.prepare("SELECT 1 FROM dreamer_evidence WHERE source = 'journal' AND ref_id = ?").get(String(fixture.journalIds[1])));
  });

  it("runs daily and weekly cycles idempotently and puts hypothesis content in both briefs", async () => {
    seedFakeDreamerSources(db);
    const now = new Date("2026-11-15T12:00:00Z");
    const daily = await runDailyCycle(db, now);
    const dailyAgain = await runDailyCycle(db, now);
    assert.equal(daily.alreadyRan, false);
    assert.equal(dailyAgain.alreadyRan, true);
    assert.equal(dailyAgain.id, daily.id);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM dreamer_runs WHERE kind = 'daily'").get()?.n, 1);
    assert.match(daily.brief, /candidate insights|Nothing new/i);

    const weekly = runWeeklyReflection(db, "2026-11-16", now);
    const weeklyAgain = runWeeklyReflection(db, "2026-11-18", now);
    assert.equal(weekly.periodKey, "2026-11-16");
    assert.equal(weeklyAgain.alreadyRan, true);
    assert.match(weekly.brief, /hypothesis/i);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM dreamer_briefs WHERE kind = 'weekly'").get()?.n, 1);
  });

  it("stores explicit suggestion feedback and suppresses rejected repeats", async () => {
    seedFakeDreamerSources(db);
    await runDailyCycle(db, new Date("2026-11-15T12:00:00Z"));
    const suggestion = db.prepare("SELECT id, signature FROM dreamer_suggestions ORDER BY id LIMIT 1").get() as { id: number; signature: string };
    assert.ok(recordSuggestionFeedback(db, suggestion.id, "dont_suggest_again", "Not useful for this setup."));
    const stored = db.prepare("SELECT choice, note FROM dreamer_feedback WHERE suggestion_id = ?").get(suggestion.id) as { choice: string; note: string };
    assert.equal(stored.choice, "dont_suggest_again");
    assert.equal(stored.note, "Not useful for this setup.");
    assert.equal((db.prepare("SELECT state FROM dreamer_suggestions WHERE id = ?").get(suggestion.id) as { state: string }).state, "dont_suggest_again");
    const count = (db.prepare("SELECT COUNT(*) AS n FROM dreamer_suggestions").get() as { n: number }).n;
    ensureRun(2);
    analyzeSources(db, 2, new Date("2026-11-15T12:00:00Z"));
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM dreamer_suggestions").get() as { n: number }).n, count);
    assert.ok(termSimilarity(suggestion.signature, suggestion.signature) > 0.99);
  });

  it("detects actionable candidates without psychological conclusions", () => {
    const candidates = detectCandidates("I want to learn SQLite. I promised to finish the sample task. What if I built a tiny helper?");
    assert.ok(candidates.some((candidate) => candidate.kind === "intention"));
    assert.ok(candidates.some((candidate) => candidate.kind === "commitment"));
    assert.ok(candidates.some((candidate) => candidate.kind === "unresolved_question"));
    assert.ok(candidates.some((candidate) => candidate.kind === "project_idea"));
    assert.ok(candidates.every((candidate) => !/diagnos|personality|trait/i.test(candidate.text)));
  });
});

describe("Dreamer Layer B injection", () => {
  it("sends the exact disclosed item list and ignores unknown evidence ids", async () => {
    const documentId = Number(db.prepare(`INSERT INTO dreamer_documents (source, ref_id, content_hash, processed_at)
      VALUES ('journal', '7', 'fake-hash', '2026-11-15T00:00:00.000Z')`).run().lastInsertRowid);
    const evidenceId = Number(db.prepare(`INSERT INTO dreamer_evidence (document_id, kind, source, ref_id, quote, start, end, date)
      VALUES (?, 'theme', 'journal', '7', 'redacted short excerpt', 0, 21, '2026-11-14')`).run(documentId).lastInsertRowid);
    const secondDocumentId = Number(db.prepare(`INSERT INTO dreamer_documents (source, ref_id, content_hash, processed_at)
      VALUES ('note', '9', 'fake-hash-2', '2026-11-15T00:00:00.000Z')`).run().lastInsertRowid);
    const secondEvidenceId = Number(db.prepare(`INSERT INTO dreamer_evidence (document_id, kind, source, ref_id, quote, start, end, date)
      VALUES (?, 'theme', 'note', '9', 'another redacted excerpt', 0, 23, '2026-11-15')`).run(secondDocumentId).lastInsertRowid);
    const items = [
      { id: String(evidenceId), label: "2026-11-14 · journal #7", text: "redacted short excerpt" },
      { id: String(secondEvidenceId), label: "2026-11-15 · note #9", text: "another redacted excerpt" },
    ];
    const disclosure = buildDisclosure("dreamer", "Refine local recurring-theme hypotheses", "fake/model", items);
    const consent: AiConsent = { feature: "dreamer", enabled: true, provider: "openrouter", model: null, grantedAt: "2026-11-01", revokedAt: null, scope: { allowDailyCycle: false, maxExcerptChars: 280 } };
    const status: AiStatus = { keyConfigured: true, killSwitch: false, defaultModel: "fake/model", consents: [consent] };
    const calls: string[] = [];
    const fake = async <T,>(request: { messages: readonly { content: string }[] }) => {
      calls.push(request.messages.at(-1)?.content ?? "");
      return { ok: true as const, data: { themes: [
        { label: "A repeated workflow hypothesis", evidenceIds: [String(evidenceId), String(secondEvidenceId)] },
        { label: "Unverified source", evidenceIds: ["999"] },
      ] } as T, model: "fake/model", usage: { promptTokens: null, completionTokens: null } };
    };
    const result = await enhanceThemesWithAi({
      db, consent, status, disclosure, sendToAi: true, chatJsonImpl: fake as ChatJsonCaller,
      now: new Date("2026-11-15T12:00:00Z"),
    });
    assert.equal(result.created, 1);
    assert.deepEqual(JSON.parse(calls[0] ?? "{}"), { evidence: disclosure.items });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM dreamer_insights WHERE origin = 'ai'").get()?.n, 1);
    assert.match((db.prepare("SELECT text FROM dreamer_insights WHERE origin = 'ai'").get() as { text: string }).text, /^AI-drafted hypothesis:/);
  });

  it("does not call the injected model without consent or a per-run confirmation", async () => {
    const item = { id: "2", label: "test evidence", text: "redacted" };
    const disclosure = buildDisclosure("dreamer", "test", "fake/model", [item]);
    const consent: AiConsent = { feature: "dreamer", enabled: true, provider: "openrouter", model: null, grantedAt: null, revokedAt: null, scope: { allowDailyCycle: false, maxExcerptChars: 280 } };
    const status: AiStatus = { keyConfigured: true, killSwitch: false, defaultModel: "fake/model", consents: [consent] };
    let calls = 0;
    const fake = async <T,>() => { calls++; return { ok: true as const, data: { themes: [] } as T, model: "fake/model", usage: { promptTokens: null, completionTokens: null } }; };
    const result = await enhanceThemesWithAi({ db, consent, status, disclosure, sendToAi: false, chatJsonImpl: fake as ChatJsonCaller });
    assert.equal(result.attempted, false);
    assert.equal(calls, 0);
  });
});
