import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { closeTestDb, installTestDb } from "../testing/test-db";
import { findPatterns, normalizeTitle } from "./index";

const TODAY = "2026-11-16";
let db: DatabaseSync;
beforeEach(() => { db = installTestDb(); for (const t of ["tasks", "goals", "habits", "chapters", "exams"]) db.exec(`DELETE FROM ${t}`); });
afterEach(() => closeTestDb());
const task = (title: string, created: string, extra = "") => db.exec(`INSERT INTO tasks (title, created_at, status ${extra ? "," + extra.split("=")[0] : ""}) VALUES ('${title}', '${created} 10:00:00', 'To do' ${extra ? "," + extra.split("=")[1] : ""})`);

describe("patterns", () => {
  it("normalises titles", () => assert.equal(normalizeTitle("Buy  Milk #2!"), "buy milk"));
  it("says nothing on an empty database", () => assert.deepEqual(findPatterns(db, TODAY), []));
  it("finds a task entered three times, not two", () => {
    for (const d of ["2026-10-01", "2026-10-15", "2026-11-01"]) task("Pay rent", d);
    task("Call dentist", "2026-11-01"); task("call dentist", "2026-11-02");
    const found = findPatterns(db, TODAY).filter((p) => p.kind === "repeated");
    assert.equal(found.length, 1);
    assert.match(found[0].title, /Pay rent.*3 times/);
  });
  it("flags idle high-priority tasks and stale backlog", () => {
    task("Write essay", "2026-10-01", "priority='High'".replace("='", "=" + "'"));
    for (const d of ["2026-10-01", "2026-10-02", "2026-10-03"]) db.exec(`INSERT INTO tasks (title, due, status) VALUES ('old ${d}', '${d}', 'To do')`);
    const kinds = findPatterns(db, TODAY).map((p) => p.id);
    assert.ok(kinds.some((k) => k.startsWith("high-idle")));
    assert.ok(kinds.includes("stale-backlog"));
  });
  it("flags a goal nobody reviewed", () => {
    db.exec("INSERT INTO goals (title, status, created_at) VALUES ('Learn guitar', 'Active', '2026-08-01 00:00:00')");
    assert.ok(findPatterns(db, TODAY).some((p) => p.title.includes("Learn guitar")));
  });
  it("finds a habit that always slips on one weekday", () => {
    db.exec("INSERT INTO habits (id, name, created_at) VALUES (1, 'Run', '2026-01-01 00:00:00')");
    for (let i = 0; i < 56; i++) {
      const d = new Date(Date.parse(`${TODAY}T00:00:00Z`) - i * 86_400_000);
      if (d.getUTCDay() !== 0) db.prepare("INSERT INTO habit_logs (habit_id, date) VALUES (1, ?)").run(d.toISOString().slice(0, 10));
    }
    const p = findPatterns(db, TODAY).find((x) => x.id.startsWith("habit-day"));
    assert.ok(p);
    assert.match(p!.title, /Sundays/);
  });
});
