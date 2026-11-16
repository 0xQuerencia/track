import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accuracyBySubject,
  subjectPerformance,
  summarizeMocks,
  totalAccuracy,
  weakChapters,
  type MockRow,
} from "./analytics";

const mock = (date: string, scored: number, total = 100, extra: Partial<MockRow> = {}): MockRow => ({
  date,
  name: `Test ${date}`,
  kind: "Chapter test",
  total_marks: total,
  scored,
  physics: null,
  chemistry: null,
  maths: null,
  ...extra,
});

describe("mock test summary", () => {
  it("returns null with no tests", () => {
    assert.equal(summarizeMocks([]), null);
  });

  it("reports latest, change, average of recent five, and best", () => {
    const rows = [
      mock("2026-11-14", 70, 100, { physics: 22, chemistry: 18, maths: 30 }),
      mock("2026-11-01", 60),
      mock("2026-10-20", 50),
      mock("2026-10-01", 40),
      mock("2026-09-01", 30),
      mock("2026-08-01", 90),
    ];
    const summary = summarizeMocks(rows);
    assert.ok(summary);
    assert.equal(summary.count, 6);
    assert.equal(summary.latest.pct, 70);
    assert.equal(summary.previousPct, 60);
    assert.equal(summary.changePts, 10);
    assert.equal(summary.averagePct, 50);
    assert.equal(summary.bestPct, 90);
    assert.deepEqual(
      summary.subjectMarks.map((s) => [s.subject, s.marks]),
      [
        ["Physics", 22],
        ["Chemistry", 18],
        ["Maths", 30],
      ],
    );
  });

  it("gives no percentage for a test with zero total marks and no change without two scored tests", () => {
    const summary = summarizeMocks([mock("2026-11-14", 5, 0)]);
    assert.ok(summary);
    assert.equal(summary.latest.pct, null);
    assert.equal(summary.changePts, null);
    assert.equal(summary.bestPct, null);
  });
});

describe("question accuracy", () => {
  it("gives null accuracy when nothing was attempted", () => {
    assert.deepEqual(totalAccuracy([]), { attempted: 0, correct: 0, accuracyPct: null });
  });

  it("totals by subject and leaves out subjects with no attempts", () => {
    const groups = [
      { subject: "Physics", chapter_id: 1, attempted: 20, correct: 15 },
      { subject: "Physics", chapter_id: null, attempted: 10, correct: 5 },
      { subject: "Chemistry", chapter_id: 2, attempted: 0, correct: 0 },
    ];
    assert.deepEqual(accuracyBySubject(groups), [
      { subject: "Physics", attempted: 30, correct: 20, accuracyPct: 67 },
    ]);
  });
});

describe("weak chapter analysis", () => {
  const chapters = [
    { id: 1, name: "Optics", subject: "Physics", done: 1, mastery: 35 },
    { id: 2, name: "Solutions", subject: "Chemistry", done: 1, mastery: 90 },
    { id: 3, name: "Matrices", subject: "Mathematics", done: 0, mastery: 0 },
  ];

  it("ranks by weakness and labels each input", () => {
    const result = weakChapters(
      chapters,
      [{ subject: "Physics", chapter: " optics", count: 3 }],
      [{ subject: "Physics", chapter_id: 1, attempted: 25, correct: 10 }],
    );
    assert.equal(result.length, 2, "covered chapters always count; uncovered ones only with data");
    const optics = result[0];
    assert.equal(optics?.chapterId, 1);
    assert.deepEqual(optics?.inputs, {
      masteryPct: 35,
      openMistakes: 3,
      attempted: 25,
      accuracyPct: 40,
    });
    assert.equal(optics?.weakness, Math.round((65 + 60 + 60) / 3));
    assert.equal(optics?.summary, "Mastery 35% · 3 open mistakes · 40% of 25 questions");
  });

  it("uses only the parts that have data", () => {
    const result = weakChapters(chapters, [], []);
    assert.equal(result.length, 2);
    const solutions = result.find((item) => item.chapterId === 2);
    assert.equal(solutions?.weakness, Math.round((10 + 0) / 2));
    assert.equal(solutions?.summary, "Mastery 90%");
  });

  it("returns a chapter with open mistakes even when not covered", () => {
    const result = weakChapters(chapters, [{ subject: "Mathematics", chapter: "Matrices", count: 5 }], []);
    assert.equal(result[0]?.chapterId, 3);
    assert.equal(result[0]?.weakness, 100);
    assert.equal(result[0]?.inputs.masteryPct, null);
  });
});

describe("subject performance", () => {
  const chapters = [
    { id: 1, name: "Optics", subject: "Physics", done: 1, mastery: 40 },
    { id: 2, name: "Wave", subject: "Physics", done: 1, mastery: 60 },
    { id: 3, name: "Kinetics", subject: "Chemistry", done: 0, mastery: 0 },
  ];

  it("averages mastery over covered chapters only and gives null for a subject without data", () => {
    const rows = subjectPerformance(chapters, [], [], ["Physics", "Chemistry", "English"]);
    const physics = rows.find((row) => row.subject === "Physics");
    assert.equal(physics?.avgMastery, 50);
    assert.equal(physics?.covered, 2);
    assert.equal(physics?.chapters, 2);
    assert.equal(rows.find((row) => row.subject === "Chemistry")?.weakness, null);
    assert.equal(rows.find((row) => row.subject === "English")?.weakness, null);
  });

  it("includes open mistakes and question accuracy in the weakness mean", () => {
    const rows = subjectPerformance(
      chapters,
      [{ subject: "Physics", chapter: "Optics", count: 4 }],
      [{ subject: "Physics", chapter_id: 1, attempted: 10, correct: 10 }],
      ["Physics"],
    );
    const physics = rows[0];
    assert.equal(physics?.openMistakes, 4);
    assert.equal(physics?.accuracyPct, 100);
    assert.equal(physics?.weakness, Math.round((50 + 40 + 0) / 3));
  });
});
