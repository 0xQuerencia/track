import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  recommendRevisions,
  type PlannerChapter,
  type PlannerMistake,
  type PlannerOverride,
  type RecommendInput,
} from "./revision";

const TODAY = "2026-11-15";
const daysBefore = (n: number): string => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/** A covered, mid-mastery chapter that is not due, so it has one signal only. */
function chapter(id: number, overrides: Partial<PlannerChapter> = {}): PlannerChapter {
  return {
    id,
    subject: "Physics",
    name: `Chapter ${id}`,
    track: "Both",
    priority: "Medium",
    mastery: 40,
    done: 1,
    weight: 3,
    est_minutes: 60,
    revision_count: 0,
    last_revised_at: TODAY,
    ...overrides,
  };
}

function plan(overrides: Partial<RecommendInput>, chapters: PlannerChapter[]) {
  return recommendRevisions({
    chapters,
    today: TODAY,
    availableMinutes: 1000,
    ...overrides,
  });
}

describe("recommendRevisions: empty and no-data states", () => {
  it("returns no items and state no_chapters when nothing is stored", () => {
    const result = plan({}, []);
    assert.equal(result.state, "no_chapters");
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.held, []);
    assert.equal(result.plannedMinutes, 0);
  });

  it("does not recommend anything when no chapter is covered, even with an exam", () => {
    const result = plan(
      { exams: [{ name: "Preboards", date: "2026-11-20", track: null }] },
      [chapter(1, { done: 0, mastery: 0, last_revised_at: null })],
    );
    assert.equal(result.state, "none_covered");
    assert.deepEqual(result.items, []);
  });

  it("does not recommend a covered chapter with no signal behind it", () => {
    const result = plan({}, [chapter(1, { mastery: 85, last_revised_at: daysBefore(1), revision_count: 1 })]);
    assert.equal(result.state, "nothing_due");
    assert.deepEqual(result.items, []);
  });

  it("treats an unknown mastery as no evidence rather than 0%", () => {
    const result = plan({}, [chapter(1, { mastery: null, last_revised_at: daysBefore(1), revision_count: 1 })]);
    assert.deepEqual(result.items, []);
  });
});

describe("recommendRevisions: ordering and reasons", () => {
  it("ranks a chapter with a nearer relevant exam above an identical chapter without one", () => {
    const result = plan(
      { exams: [{ name: "JEE Main", date: "2026-11-25", track: "JEE" }] },
      [chapter(1, { track: "JEE" }), chapter(2, { track: "Boards" })],
    );
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0]?.chapterId, 1);
    assert.equal(result.items[0]?.breakdown.exam, 36);
    assert.ok(result.items[0]?.reasons.includes("Exam in 10 days (JEE Main)"));
    assert.equal(result.items[1]?.breakdown.exam, 0);
  });

  it("ignores exams of the other track and exams beyond the window", () => {
    const result = plan(
      {
        exams: [
          { name: "JEE Main", date: "2026-11-20", track: "JEE" },
          { name: "Far away", date: "2027-06-01", track: null },
        ],
      },
      [chapter(1, { track: "Boards" }), chapter(2, { track: "JEE" })],
    );
    const boards = result.items.find((item) => item.chapterId === 1);
    const jee = result.items.find((item) => item.chapterId === 2);
    assert.equal(boards?.breakdown.exam, 0);
    assert.ok((jee?.breakdown.exam ?? 0) > 0);
    assert.ok(jee?.reasons.some((r) => r.includes("JEE Main")));
  });

  it("names a low mastery with its percentage", () => {
    const result = plan({}, [chapter(1, { mastery: 35 })]);
    assert.ok(result.items[0]?.reasons.includes("Mastery 35% (below 60%)"));
  });

  it("reports staleness from the spaced-repetition gap for revision_count", () => {
    const result = plan(
      {},
      [chapter(1, { mastery: 90, revision_count: 3, last_revised_at: daysBefore(21) })],
    );
    const item = result.items[0];
    assert.ok(item, "a chapter 21 days past a 14-day gap is due");
    assert.ok(item.reasons.includes("Last revised 21 days ago"));
    assert.equal(item.breakdown.stale, 20);
  });

  it("does not flag a chapter that is inside its gap", () => {
    const result = plan(
      {},
      [chapter(1, { mastery: 90, revision_count: 3, last_revised_at: daysBefore(7) })],
    );
    assert.deepEqual(result.items, []);
  });

  it("marks a chapter never revised", () => {
    const result = plan({}, [chapter(1, { mastery: 90, last_revised_at: null })]);
    assert.ok(result.items[0]?.reasons.includes("Never revised"));
  });

  it("uses only the latest revision for the confidence signal", () => {
    const chapters = [chapter(1, { mastery: 90, revision_count: 2, last_revised_at: TODAY })];
    const older = plan(
      { revisions: [{ chapter_id: 1, date: daysBefore(5), confidence: 1 }, { chapter_id: 1, date: daysBefore(1), confidence: 4 }] },
      chapters,
    );
    assert.deepEqual(older.items, [], "a newer confident revision clears the low-confidence signal");
    const low = plan(
      { revisions: [{ chapter_id: 1, date: daysBefore(1), confidence: 2 }] },
      chapters,
    );
    assert.ok(low.items[0]?.reasons.includes("Last confidence 2/5"));
  });

  it("counts only unfixed mistakes from the last 30 days that name the chapter", () => {
    const mistakes: PlannerMistake[] = [
      { subject: "Physics", chapter: "  chapter 1 ", date: daysBefore(2), fixed: 0 },
      { subject: "Physics", chapter: "Chapter 1", date: daysBefore(10), fixed: 0 },
      { subject: null, chapter: "Chapter 1", date: daysBefore(5), fixed: 0 },
      { subject: "Physics", chapter: "Chapter 1", date: daysBefore(45), fixed: 0 },
      { subject: "Physics", chapter: "Chapter 1", date: daysBefore(3), fixed: 1 },
      { subject: "Physics", chapter: "Chapter 2", date: daysBefore(1), fixed: 0 },
    ];
    const result = plan({ mistakes }, [chapter(1, { mastery: 90 })]);
    const item = result.items[0];
    assert.ok(item?.reasons.includes("3 recent mistakes"));
    assert.equal(item?.breakdown.mistakes, 15);
  });

  it("adds a high-priority chapter even when it is otherwise fine", () => {
    const result = plan({}, [chapter(1, { mastery: 90, priority: "High" })]);
    assert.ok(result.items[0]?.reasons.includes("High priority"));
  });
});

describe("recommendRevisions: prerequisites", () => {
  it("penalises a chapter whose prerequisite is weak and names it", () => {
    const chapters = [
      chapter(1, { name: "Electric Charges", mastery: 30 }),
      chapter(2, { name: "Electrostatic Potential", mastery: 50 }),
    ];
    const without = plan({}, chapters);
    const withPrereq = plan({ prereqs: [{ chapter_id: 2, prereq_id: 1 }] }, chapters);
    const before = without.items.find((item) => item.chapterId === 2);
    const after = withPrereq.items.find((item) => item.chapterId === 2);
    assert.equal(after?.breakdown.prereqPenalty, 5);
    assert.ok(after?.reasons.includes("Prerequisite Electric Charges is weak (30%)"));
    assert.equal((before?.score ?? 0) - (after?.score ?? 0), 5);
  });

  it("names an uncovered prerequisite", () => {
    const chapters = [chapter(1, { done: 0, mastery: 0, last_revised_at: null }), chapter(2, { mastery: 50 })];
    const result = plan({ prereqs: [{ chapter_id: 2, prereq_id: 1 }] }, chapters);
    assert.ok(result.items[0]?.reasons.includes("Prerequisite Chapter 1 is not covered yet"));
  });
});

describe("recommendRevisions: overrides", () => {
  it("lists a pinned chapter first, even with no signal, and says why", () => {
    const overrides: PlannerOverride[] = [{ chapter_id: 2, action: "pin", until: "2026-11-22" }];
    const result = plan(
      { overrides },
      [chapter(1, { mastery: 35 }), chapter(2, { mastery: 90, last_revised_at: TODAY })],
    );
    assert.equal(result.items[0]?.chapterId, 2);
    assert.equal(result.items[0]?.pinned, true);
    assert.equal(result.items[0]?.reasons[0], "Pinned until 2026-11-22");
  });

  it("holds a snoozed chapter out of the plan and reports it as held", () => {
    const overrides: PlannerOverride[] = [{ chapter_id: 1, action: "snooze", until: "2026-11-18" }];
    const result = plan({ overrides }, [chapter(1, { mastery: 10 }), chapter(2, { mastery: 20 })]);
    assert.deepEqual(result.items.map((item) => item.chapterId), [2]);
    assert.deepEqual(result.held, [
      { chapterId: 1, name: "Chapter 1", subject: "Physics", action: "snooze", until: "2026-11-18" },
    ]);
  });

  it("holds a skipped chapter the same way", () => {
    const overrides: PlannerOverride[] = [{ chapter_id: 1, action: "skip", until: "2026-12-01" }];
    const result = plan({ overrides }, [chapter(1, { mastery: 10 })]);
    assert.deepEqual(result.items, []);
    assert.equal(result.held[0]?.action, "skip");
    assert.equal(result.state, "nothing_due");
  });

  it("ignores an override whose date has passed", () => {
    const overrides: PlannerOverride[] = [{ chapter_id: 1, action: "snooze", until: "2026-11-14" }];
    const result = plan({ overrides }, [chapter(1, { mastery: 10 })]);
    assert.equal(result.items.length, 1);
    assert.deepEqual(result.held, []);
  });
});

describe("recommendRevisions: time budget", () => {
  const chapters = [
    chapter(1, { mastery: 10, est_minutes: 60 }),
    chapter(2, { mastery: 20, est_minutes: 60 }),
    chapter(3, { mastery: 30, est_minutes: 30 }),
  ];

  it("plans the ranked items that fit and leaves the rest unplanned, not dropped", () => {
    const result = plan({ availableMinutes: 100 }, chapters);
    assert.deepEqual(result.items.map((item) => item.chapterId), [1, 2, 3]);
    assert.deepEqual(result.items.map((item) => item.planned), [true, false, true]);
    assert.equal(result.plannedMinutes, 90);
    assert.equal(result.budgetMinutes, 100);
  });

  it("plans nothing with a zero budget but still ranks everything", () => {
    const result = plan({ availableMinutes: 0 }, chapters);
    assert.equal(result.items.length, 3);
    assert.equal(result.items.some((item) => item.planned), false);
    assert.equal(result.plannedMinutes, 0);
  });

  it("plans everything with no limit", () => {
    const result = plan({ availableMinutes: Number.POSITIVE_INFINITY }, chapters);
    assert.equal(result.items.every((item) => item.planned), true);
    assert.equal(result.plannedMinutes, 150);
  });

  it("gives a pinned chapter first claim on the budget", () => {
    const overrides: PlannerOverride[] = [{ chapter_id: 3, action: "pin", until: "2026-11-20" }];
    const result = plan({ availableMinutes: 40, overrides }, chapters);
    assert.equal(result.items[0]?.chapterId, 3);
    assert.equal(result.items[0]?.planned, true);
  });
});

describe("recommendRevisions: determinism", () => {
  it("returns the same plan for the same input and orders ties by chapter id", () => {
    const chapters = [chapter(7, { mastery: 40 }), chapter(3, { mastery: 40 })];
    const first = plan({}, chapters);
    const second = plan({}, chapters);
    assert.deepEqual(first, second);
    assert.deepEqual(first.items.map((item) => item.chapterId), [3, 7]);
  });
});
