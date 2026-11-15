import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { closeTestDb, installTestDb } from "../testing/test-db";
import { addDays } from "../dates";
import {
  getNextExam,
  getRecentMockSummary,
  getRevisionQueue,
  getTodayStudyTargets,
  getWeakestSubjects,
} from "./index";
import {
  addPrereq,
  deleteRevision,
  logRevision,
  removeOverride,
  removePrereq,
  setOverride,
} from "./mutations";

const TODAY = "2026-11-15";

beforeEach(() => {
  installTestDb();
  // The seed adds a starter syllabus and an exam. Start each test empty.
  const db = getDb();
  db.exec("DELETE FROM chapters");
  db.exec("DELETE FROM exams");
});

afterEach(() => closeTestDb());

function chapter(name: string, fields: Record<string, string | number | null> = {}): number {
  const values = {
    subject: "Physics",
    klass: "12",
    track: "Both",
    priority: "Medium",
    mastery: 40,
    done: 1,
    weight: 3,
    est_minutes: 60,
    revision_count: 0,
    last_revised_at: TODAY,
    ...fields,
  };
  const result = getDb()
    .prepare(
      `INSERT INTO chapters (subject, klass, track, name, priority, mastery, done, weight, est_minutes, revision_count, last_revised_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      values.subject,
      values.klass,
      values.track,
      name,
      values.priority,
      values.mastery,
      values.done,
      values.weight,
      values.est_minutes,
      values.revision_count,
      values.last_revised_at,
    );
  return Number(result.lastInsertRowid);
}

const one = <T>(sql: string, ...params: (string | number | null)[]): T =>
  getDb().prepare(sql).get(...params) as T;

describe("logRevision and deleteRevision", () => {
  it("bumps the count and the last date, and leaves mastery alone when none is entered", () => {
    const id = chapter("Optics", { mastery: 50, revision_count: 1, last_revised_at: "2026-11-01" });
    const result = logRevision({
      chapterId: id,
      date: "2026-11-10",
      minutes: 45,
      confidence: 3,
      notes: null,
      masteryAfter: null,
    });
    assert.deepEqual(result, { ok: true });
    const row = one<{ revision_count: number; last_revised_at: string; mastery: number }>(
      "SELECT revision_count, last_revised_at, mastery FROM chapters WHERE id = ?",
      id,
    );
    assert.equal(row.revision_count, 2);
    assert.equal(row.last_revised_at, "2026-11-10");
    assert.equal(row.mastery, 50);
  });

  it("sets mastery only when the user entered a value and keeps the later last-revised date", () => {
    const id = chapter("Optics", { last_revised_at: "2026-11-12" });
    logRevision({ chapterId: id, date: "2026-11-05", minutes: null, confidence: null, notes: null, masteryAfter: 75 });
    const row = one<{ last_revised_at: string; mastery: number }>(
      "SELECT last_revised_at, mastery FROM chapters WHERE id = ?",
      id,
    );
    assert.equal(row.last_revised_at, "2026-11-12");
    assert.equal(row.mastery, 75);
  });

  it("rejects invalid input without writing", () => {
    const id = chapter("Optics");
    const base = { chapterId: id, date: "2026-11-10", minutes: null, confidence: null, notes: null, masteryAfter: null };
    assert.equal(logRevision({ ...base, date: "10/11/2026" }).ok, false);
    assert.equal(logRevision({ ...base, confidence: 6 }).ok, false);
    assert.equal(logRevision({ ...base, masteryAfter: 101 }).ok, false);
    assert.equal(logRevision({ ...base, chapterId: 9999 }).ok, false);
    const count = one<{ n: number }>("SELECT COUNT(*) AS n FROM revisions");
    assert.equal(count.n, 0);
  });

  it("recomputes the count and last date when a revision is removed", () => {
    const id = chapter("Optics", { revision_count: 0, last_revised_at: null });
    logRevision({ chapterId: id, date: "2026-11-01", minutes: null, confidence: null, notes: null, masteryAfter: null });
    logRevision({ chapterId: id, date: "2026-11-09", minutes: null, confidence: null, notes: null, masteryAfter: null });
    const later = one<{ id: number }>("SELECT id FROM revisions WHERE date = '2026-11-09'");
    assert.deepEqual(deleteRevision(later.id), { ok: true });
    const row = one<{ revision_count: number; last_revised_at: string }>(
      "SELECT revision_count, last_revised_at FROM chapters WHERE id = ?",
      id,
    );
    assert.equal(row.revision_count, 1);
    assert.equal(row.last_revised_at, "2026-11-01");
  });
});

describe("prerequisites", () => {
  it("adds, refuses loops and self links, and removes", () => {
    const a = chapter("A");
    const b = chapter("B");
    const c = chapter("C");
    assert.deepEqual(addPrereq(b, a), { ok: true });
    assert.deepEqual(addPrereq(c, b), { ok: true });
    assert.equal(addPrereq(a, c).ok, false, "A -> C would close a loop");
    assert.equal(addPrereq(a, a).ok, false, "self link");
    assert.equal(addPrereq(b, a).ok, false, "duplicate");
    const link = one<{ id: number }>("SELECT id FROM chapter_prereqs WHERE chapter_id = ?", b);
    assert.deepEqual(removePrereq(link.id), { ok: true });
    assert.deepEqual(addPrereq(a, c), { ok: true }, "allowed once the loop link is gone");
  });

  it("removes prerequisite links when a chapter is deleted", () => {
    const a = chapter("A");
    const b = chapter("B");
    addPrereq(b, a);
    getDb().prepare("DELETE FROM chapters WHERE id = ?").run(a);
    const left = one<{ n: number }>("SELECT COUNT(*) AS n FROM chapter_prereqs");
    assert.equal(left.n, 0);
  });
});

describe("overrides", () => {
  it("sets one override per chapter with the until date from the action", () => {
    const id = chapter("A");
    assert.deepEqual(setOverride(id, "pin", TODAY), { ok: true });
    assert.deepEqual(setOverride(id, "snooze", TODAY), { ok: true });
    const rows = getDb().prepare("SELECT action, until FROM revision_overrides WHERE chapter_id = ?").all(id);
    assert.equal(rows.length, 1);
    assert.equal((rows[0] as { action: string }).action, "snooze");
    assert.equal((rows[0] as { until: string }).until, addDays(TODAY, 3));
  });

  it("rejects an unknown action and removes an override by id", () => {
    const id = chapter("A");
    assert.equal(setOverride(id, "delete", TODAY).ok, false);
    setOverride(id, "skip", TODAY);
    const row = one<{ id: number }>("SELECT id FROM revision_overrides WHERE chapter_id = ?", id);
    assert.deepEqual(removeOverride(row.id), { ok: true });
  });
});

describe("planner through the public API", () => {
  it("returns an empty queue and no targets when nothing is stored", () => {
    assert.deepEqual(getRevisionQueue(TODAY, 5), []);
    assert.equal(getNextExam(TODAY), null);
    assert.equal(getRecentMockSummary(), null);
    assert.deepEqual(getWeakestSubjects(), []);
    const targets = getTodayStudyTargets(TODAY);
    assert.equal(targets.revisionState, "no_chapters");
    assert.deepEqual(targets.revisions, []);
    assert.deepEqual(targets.dueAssignments, []);
    assert.deepEqual(targets.lecturesPlanned, []);
  });

  it("finds the nearest upcoming exam with days left", () => {
    getDb().exec(`INSERT INTO exams (name, date, track) VALUES ('Later', '2026-12-30', 'JEE'), ('Preboards', '2026-11-20', 'Boards')`);
    const exam = getNextExam(TODAY);
    assert.equal(exam?.name, "Preboards");
    assert.equal(exam?.days, 5);
  });

  it("fits today's revisions to the budget and lists due assignments and planned lectures", () => {
    const weak = chapter("Weak", { mastery: 20, est_minutes: 60 });
    const other = chapter("Other", { mastery: 30, est_minutes: 90 });
    chapter("Not covered", { done: 0, mastery: 0, last_revised_at: null });
    getDb().exec(`INSERT INTO assignments (title, due_date, status) VALUES ('Worksheet 3', '2026-11-14', 'Todo'), ('Done one', '2026-11-14', 'Done'), ('Later one', '2026-11-30', 'Todo')`);
    getDb().exec(`INSERT INTO lectures (title, planned_date, duration_min, watched_min) VALUES ('Lens', '2026-11-15', 40, 0), ('Other day', '2026-11-16', 40, 0)`);
    const targets = getTodayStudyTargets(TODAY, 100);
    assert.deepEqual(targets.revisions.map((item) => item.chapterId), [weak]);
    assert.equal(targets.plannedMinutes, 60);
    assert.ok(other > weak);
    assert.deepEqual(targets.dueAssignments.map((row) => row.title), ["Worksheet 3"]);
    assert.deepEqual(targets.lecturesPlanned.map((row) => row.title), ["Lens"]);
    assert.equal(targets.revisionState, "ready");
  });

  it("returns a limited queue in rank order, ignoring the budget", () => {
    chapter("Low", { mastery: 50, est_minutes: 300 });
    chapter("Lowest", { mastery: 5, est_minutes: 300 });
    chapter("Middle", { mastery: 30, est_minutes: 300 });
    const queue = getRevisionQueue(TODAY, 2);
    assert.equal(queue.length, 2);
    assert.ok(queue[0] && queue[1] && queue[0].score >= queue[1].score);
    assert.ok(queue.every((item) => item.planned));
  });

  it("explains weakest subjects with their inputs and leaves out subjects without data", () => {
    const optics = chapter("Optics", { subject: "Physics", mastery: 30 });
    getDb().exec(`INSERT INTO mistakes (date, subject, chapter, note, fixed) VALUES ('2026-11-10', 'Physics', 'optics', 'sign error', 0), ('2026-11-10', 'Physics', 'Optics', 'fixed one', 1)`);
    getDb().exec(`INSERT INTO question_stats (date, subject, chapter_id, attempted, correct) VALUES ('2026-11-01', 'Physics', ${optics}, 20, 8), ('2026-11-02', 'Physics', NULL, 5, 5)`);
    const subjects = getWeakestSubjects();
    assert.deepEqual(subjects.map((s) => s.subject), ["Physics"]);
    const physics = subjects[0];
    assert.equal(physics?.openMistakes, 1);
    assert.equal(physics?.attempted, 25);
    assert.equal(physics?.accuracyPct, 52);
    assert.equal(physics?.avgMastery, 30);
    assert.equal(physics?.weakness, Math.round((70 + 10 + 48) / 3));
  });

  it("summarises mock tests, newest first", () => {
    getDb().exec(`INSERT INTO mock_tests (date, name, kind, total_marks, scored, physics, chemistry, maths) VALUES
      ('2026-10-01', 'Mock A', 'Boards', 100, 40, 10, 12, 18),
      ('2026-11-01', 'Mock B', 'JEE Main', 100, 65, 25, 20, 20)`);
    const summary = getRecentMockSummary();
    assert.ok(summary);
    assert.equal(summary.count, 2);
    assert.equal(summary.latest.name, "Mock B");
    assert.equal(summary.latest.pct, 65);
    assert.equal(summary.changePts, 25);
    assert.equal(summary.bestPct, 65);
    assert.equal(summary.subjectMarks[0]?.marks, 25);
  });

  it("keeps question accuracy when a chapter is deleted, without the chapter link", () => {
    const id = chapter("Gone");
    getDb().exec(`INSERT INTO question_stats (date, subject, chapter_id, attempted, correct) VALUES ('2026-11-01', 'Physics', ${id}, 10, 4)`);
    getDb().prepare("DELETE FROM chapters WHERE id = ?").run(id);
    const row = one<{ chapter_id: number | null; attempted: number }>("SELECT chapter_id, attempted FROM question_stats");
    assert.equal(row.chapter_id, null);
    assert.equal(row.attempted, 10);
  });
});
