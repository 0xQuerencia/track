import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { searchAll } from "../crud";
import { closeTestDb, installTestDb } from "../testing/test-db";
import { entriesBetween, listJournal } from "./entries";
import { DRAFT_KEY, parseDraft } from "./drafts";
import { reflectionRange, splitTags, summarizeEntries, tagFrequency, type ReflectionEntry } from "./reflect";

const entry = (overrides: Partial<ReflectionEntry>): ReflectionEntry => ({
  date: "2026-11-10",
  mood: null,
  energy: null,
  win: null,
  setback: null,
  tags: null,
  ...overrides,
});

describe("reflection aggregates", () => {
  it("counts entries, days, wins and setbacks from recorded values only", () => {
    const summary = summarizeEntries([
      entry({ date: "2026-11-10", win: "Shipped it", setback: "" }),
      entry({ date: "2026-11-10", setback: "Missed a run" }),
      entry({ date: "2026-11-12", win: "   " }),
    ]);
    assert.equal(summary.entries, 3);
    assert.equal(summary.daysWithEntries, 2);
    assert.equal(summary.wins, 1, "whitespace-only wins do not count");
    assert.equal(summary.setbacks, 1);
  });

  it("averages mood and energy to one decimal, ignoring entries without a score", () => {
    const summary = summarizeEntries([
      entry({ mood: 4, energy: 3 }),
      entry({ mood: 3, energy: null }),
      entry({ mood: null, energy: 5 }),
    ]);
    assert.equal(summary.moodAverage, 3.5);
    assert.equal(summary.moodCount, 2);
    assert.equal(summary.energyAverage, 4);
    assert.equal(summary.energyCount, 2);
  });

  it("reports no average when nothing was scored, rather than zero", () => {
    const summary = summarizeEntries([entry({ mood: null, energy: null })]);
    assert.equal(summary.moodAverage, null);
    assert.equal(summary.energyAverage, null);
    const none = summarizeEntries([]);
    assert.equal(none.entries, 0);
    assert.equal(none.moodAverage, null);
  });

  it("counts tags across entries, ignoring case and repeats within one entry", () => {
    const tags = tagFrequency([
      entry({ tags: "Study, health, study" }),
      entry({ tags: "health" }),
      entry({ tags: "Projects" }),
    ]);
    assert.deepEqual(tags, [
      { tag: "health", count: 2 },
      { tag: "Projects", count: 1 },
      { tag: "Study", count: 1 },
    ], "ties are ordered by name");
  });

  it("splits tags, dropping blanks", () => {
    assert.deepEqual(splitTags(" a, ,b ,,"), ["a", "b"]);
    assert.deepEqual(splitTags(null), []);
  });

  it("covers the last seven days for the week view and the calendar month for the month view", () => {
    assert.deepEqual(reflectionRange("week", "2026-11-15"), {
      start: "2026-11-09",
      end: "2026-11-15",
      label: "The last seven days",
    });
    assert.equal(reflectionRange("month", "2026-11-15").start, "2026-11-01");
    assert.equal(reflectionRange("month", "2026-11-15").end, "2026-11-15");
  });
});

describe("parseDraft", () => {
  it("accepts a stored draft and ignores anything malformed", () => {
    assert.deepEqual(parseDraft(JSON.stringify({ title: "Morning", text: "hello", mood: 4, extra: "x" })), {
      title: "Morning",
      text: "hello",
    });
    assert.equal(parseDraft("not json"), null);
    assert.equal(parseDraft("[1,2]"), null);
    assert.equal(parseDraft(null), null);
    assert.equal(parseDraft(JSON.stringify({ mood: 4 })), null);
    assert.ok(DRAFT_KEY.length > 0);
  });

  it("caps field lengths", () => {
    const draft = parseDraft(JSON.stringify({ title: "x".repeat(500) }));
    assert.equal(draft?.title?.length, 200);
  });
});

describe("journal database queries", () => {
  beforeEach(() => {
    installTestDb();
    const insert = getDb().prepare(
      `INSERT INTO journal_entries (date, title, tags, mood, win, setback, text) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run("2026-11-10", "Morning run", "health, Study", 4, "Ran 5k", null, "Felt the cold on the second loop");
    insert.run("2026-11-11", null, "projects", 2, null, "Lost focus", "A hard afternoon with secretive wording");
    insert.run("2026-10-01", "Old note", null, null, null, null, "outside the window");
  });
  afterEach(() => closeTestDb());
  after(() => closeTestDb());

  it("filters by whole tags, not substrings", () => {
    assert.deepEqual(listJournal({ q: "", tag: "health" }).map((r) => r.title), ["Morning run"]);
    assert.deepEqual(listJournal({ q: "", tag: "heal" }).length, 0, "a partial tag does not match");
    assert.deepEqual(listJournal({ q: "", tag: "study" }).map((r) => r.title), ["Morning run"], "tags ignore case");
  });

  it("searches the body as well as title and tags", () => {
    assert.equal(listJournal({ q: "secretive", tag: "" }).length, 1);
    assert.equal(listJournal({ q: "%", tag: "" }).length, 0, "percent is literal, not a wildcard");
  });

  it("returns only entries inside the date range", () => {
    const inMonth = entriesBetween("2026-11-01", "2026-11-30");
    assert.equal(inMonth.length, 2);
  });

  it("search hits show the title and date only, never the body", () => {
    const hits = searchAll("secretive");
    const hit = hits.find((h) => h.entity === "journal_entries");
    assert.ok(hit, "the body match is still found");
    assert.equal(hit.title, "Journal entry #2", "the untitled entry shows its label, not its body");
    assert.ok(!hit.title.includes("secretive"), "body text must not appear in the hit title");
    assert.ok(!JSON.stringify(hit).includes("secretive wording"), "body text must not appear in the hit");
  });
});
