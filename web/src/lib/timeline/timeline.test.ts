import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { closeTestDb, installTestDb } from "../testing/test-db";
import { getTimeline } from "./index";

describe("timeline", () => {
  beforeEach(() => installTestDb());
  afterEach(() => closeTestDb());

  it("is empty with no records in range", () => {
    const r = getTimeline({ from: "2000-01-01", to: "2000-01-02" });
    assert.deepEqual(r.events, []);
  });

  it("merges sources newest first with stable ids, and hides journal text", () => {
    const db = getDb();
    db.prepare(`INSERT INTO study_sessions (date, subject, minutes) VALUES ('2030-05-02','Physics',45)`).run();
    db.prepare(`INSERT INTO journal_entries (date, title, text) VALUES ('2030-05-03','secret title','secret body')`).run();
    const a = getTimeline({ from: "2030-05-01", to: "2030-05-31" });
    const b = getTimeline({ from: "2030-05-01", to: "2030-05-31" });
    assert.deepEqual(a.events.map((e) => e.id), b.events.map((e) => e.id));
    assert.equal(a.events[0].category, "Journal");
    assert.equal(a.events[0].title, "Journal entry");
    assert.ok(!JSON.stringify(a.events).includes("secret"));
    assert.equal(a.events[1].title, "Studied Physics for 45 min");
  });

  it("filters by category and text", () => {
    const db = getDb();
    db.prepare(`INSERT INTO study_sessions (date, subject, minutes) VALUES ('2030-05-02','Physics',45)`).run();
    db.prepare(`INSERT INTO focus_sessions (date, minutes) VALUES ('2030-05-02', 25)`).run();
    const only = getTimeline({ from: "2030-05-01", to: "2030-05-31", categories: ["Focus"] });
    assert.equal(only.events.length, 1);
    const q = getTimeline({ from: "2030-05-01", to: "2030-05-31", q: "physics" });
    assert.equal(q.events.length, 1);
  });
});
