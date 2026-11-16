import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { closeTestDb, installTestDb } from "../testing/test-db";
import { getReview, reviewRange, shiftAnchor } from "./index";

describe("review", () => {
  beforeEach(() => installTestDb());
  afterEach(() => closeTestDb());

  it("computes week and month ranges", () => {
    assert.deepEqual(reviewRange("week", "2030-05-01"), { from: "2030-04-29", to: "2030-05-05" });
    assert.deepEqual(reviewRange("month", "2030-02-10"), { from: "2030-02-01", to: "2030-02-28" });
    assert.deepEqual(reviewRange("day", "2030-02-10"), { from: "2030-02-10", to: "2030-02-10" });
    assert.equal(shiftAnchor("month", "2030-03-15", -1), "2030-02-28");
    assert.equal(shiftAnchor("week", "2030-05-01", 1), "2030-05-06");
  });

  it("is all zeros with no data (nothing invented)", () => {
    const r = getReview("week", "2030-05-01");
    assert.equal(r.tasksCompleted, 0);
    assert.equal(r.studyMinutes, 0);
    assert.equal(r.averageMood, null);
    assert.deepEqual(r.mocks, []);
  });

  it("sums only rows inside the period", () => {
    const db = getDb();
    const ins = db.prepare(`INSERT INTO study_sessions (date, subject, minutes, questions, correct) VALUES (?, 'Physics', ?, 10, 7)`);
    ins.run("2030-05-02", 30);
    ins.run("2030-05-30", 99);
    db.prepare(`INSERT INTO transactions (date, kind, amount, category) VALUES ('2030-05-02','Income',500,'x'),('2030-05-03','Expense',120,'y')`).run();
    const r = getReview("week", "2030-05-01");
    assert.equal(r.studyMinutes, 30);
    assert.equal(r.questions, 10);
    assert.equal(r.correct, 7);
    assert.equal(r.income, 500);
    assert.equal(r.expenses, 120);
  });
});
