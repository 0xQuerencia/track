import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { closeTestDb } from "../testing/test-db";
import { clearCalendarSources, installCalendarDb } from "./fixtures";
import {
  MAX_RANGE_DAYS,
  getAgendaForDate,
  getCalendarItems,
  getUpcomingItems,
} from "./aggregate";
import { itemsByDay } from "./grid";

const NOW = new Date("2026-11-15T06:00:00Z"); // 11:30 on the 15th in Kolkata
const ZONE = "Asia/Kolkata";
const options = { now: NOW, zone: ZONE };

beforeEach(() => {
  const db = installCalendarDb();
  clearCalendarSources(db);
});
afterEach(() => {
  closeTestDb();
});

const ids = (items: { id: string }[]) => items.map((item) => item.id).sort();

describe("source-aware aggregation", () => {
  it("merges every source for one day with a distinct, stable id per record", () => {
    const db = getDb();
    db.exec(`INSERT INTO tasks (id, title, due, status, area) VALUES (1, 'Revise optics', '2026-11-15', 'To do', 'Study')`);
    db.exec(`INSERT INTO exams (id, name, date, target_pct) VALUES (1, 'Chem mock', '2026-11-15', 80)`);
    db.exec(`INSERT INTO goals (id, title, area, target_date, status) VALUES (1, 'Finish Ch. 4', 'Study', '2026-11-15', 'Active')`);
    db.exec(`INSERT INTO events (id, title, date) VALUES (1, 'Dentist', '2026-11-15')`);

    const items = getCalendarItems("2026-11-15", "2026-11-15", {}, options);
    assert.deepEqual(ids(items), ["event:1", "exam:1", "goal:1", "task:1"]);
    assert.equal(new Set(items.map((item) => item.id)).size, items.length, "no record appears twice");
  });

  it("does not collide a task and an exam that share a rowid", () => {
    const db = getDb();
    db.exec(`INSERT INTO tasks (id, title, due, status, area) VALUES (7, 'Pack', '2026-11-18', 'To do', 'Life')`);
    db.exec(`INSERT INTO exams (id, name, date) VALUES (7, 'Physics paper', '2026-11-18')`);
    const items = getCalendarItems("2026-11-18", "2026-11-18", {}, options);
    assert.deepEqual(ids(items), ["exam:7", "task:7"]);
    const task = items.find((item) => item.source === "task");
    assert.equal(task?.href, "/plans");
    assert.equal(task?.editable, false, "other sources are read-only on the calendar");
  });

  it("expands a repeating event into one item per occurrence, with occurrence dates in the ids", () => {
    getDb().exec(
      `INSERT INTO events (id, title, date, recurrence, recurrence_until)
       VALUES (3, 'Mock review', '2026-11-05', 'Monthly', '2027-01-31')`,
    );
    const items = getCalendarItems("2026-11-01", "2027-01-31", {}, options);
    assert.deepEqual(ids(items), [
      "event:3:2026-11-05",
      "event:3:2026-12-05",
      "event:3:2027-01-05",
    ]);
    assert.ok(items.every((item) => item.editable && item.repeats && item.sourceId === 3));
    assert.equal(items[0].href, "/calendar?event=3");
  });

  it("keeps a one-off event's id free of a date suffix", () => {
    getDb().exec(`INSERT INTO events (id, title, date, start_time, end_time) VALUES (2, 'Gym', '2026-11-16', '07:00', '08:00')`);
    const [item] = getCalendarItems("2026-11-16", "2026-11-16", {}, options);
    assert.equal(item.id, "event:2");
    assert.equal(item.time, "07:00");
    assert.equal(item.endTime, "08:00");
    assert.equal(item.allDay, false);
    assert.equal(item.editable, true);
  });

  it("spans multi-day events across every day they cover", () => {
    getDb().exec(`INSERT INTO events (id, title, date, end_date) VALUES (4, 'Trip', '2026-11-20', '2026-11-23')`);
    const items = getCalendarItems("2026-11-18", "2026-11-30", {}, options);
    const byDay = itemsByDay(items, "2026-11-18", "2026-11-30");
    assert.deepEqual(
      ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"].map((day) => (byDay.get(day) ?? []).length),
      [1, 1, 1, 1],
    );
    assert.equal(byDay.get("2026-11-24"), undefined);
  });
});

describe("overdue and done markers", () => {
  it("marks open tasks and goals with a past deadline as overdue, but not finished ones or exams", () => {
    const db = getDb();
    db.exec(`INSERT INTO tasks (id, title, due, status) VALUES (1, 'Late', '2026-11-10', 'To do')`);
    db.exec(`INSERT INTO tasks (id, title, due, status) VALUES (2, 'Done late', '2026-11-10', 'Done')`);
    db.exec(`INSERT INTO goals (id, title, target_date, status) VALUES (1, 'Missed', '2026-11-12', 'Active')`);
    db.exec(`INSERT INTO exams (id, name, date) VALUES (1, 'Old paper', '2026-11-12')`);

    const items = getCalendarItems("2026-11-10", "2026-11-12", {}, options);
    const byId = new Map(items.map((item) => [item.id, item]));
    assert.equal(byId.get("task:1")?.overdue, true);
    assert.equal(byId.get("task:2")?.overdue, false);
    assert.equal(byId.get("task:2")?.done, true);
    assert.equal(byId.get("goal:1")?.overdue, true);
    assert.equal(byId.get("exam:1")?.overdue, false);
  });

  it("decides overdue by the calendar's zone, not the server's", () => {
    getDb().exec(`INSERT INTO tasks (id, title, due, status) VALUES (1, 'Edge', '2026-11-14', 'To do')`);
    // At 19:00 UTC on the 14th it is already the 15th in Kolkata.
    const late = new Date("2026-11-14T19:00:00Z");
    const kolkata = getCalendarItems("2026-11-14", "2026-11-14", {}, { now: late, zone: "Asia/Kolkata" });
    assert.equal(kolkata[0].overdue, true);
    const utc = getCalendarItems("2026-11-14", "2026-11-14", {}, { now: late, zone: "UTC" });
    assert.equal(utc[0].overdue, false);
  });
});

describe("filters", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec(`INSERT INTO tasks (id, title, due, status, area) VALUES (1, 'Cook', '2026-11-15', 'To do', 'Life')`);
    db.exec(`INSERT INTO exams (id, name, date) VALUES (1, 'Mock', '2026-11-15')`);
    db.exec(`INSERT INTO events (id, title, date, category) VALUES (1, 'Doctor', '2026-11-15', 'Health')`);
  });

  it("narrows by source", () => {
    assert.deepEqual(
      ids(getCalendarItems("2026-11-15", "2026-11-15", { sources: ["task", "exam"] }, options)),
      ["exam:1", "task:1"],
    );
  });

  it("narrows by category", () => {
    assert.deepEqual(
      ids(getCalendarItems("2026-11-15", "2026-11-15", { categories: ["Exam", "Health"] }, options)),
      ["event:1", "exam:1"],
    );
  });

  it("treats empty filter lists as no filter", () => {
    assert.equal(getCalendarItems("2026-11-15", "2026-11-15", { sources: [], categories: [] }, options).length, 3);
  });

  it("maps a task's area to a category", () => {
    const [task] = getCalendarItems("2026-11-15", "2026-11-15", { sources: ["task"] }, options);
    assert.equal(task.category, "Personal");
  });
});

describe("optional sources", () => {
  it("contributes nothing when the projects table has no milestone_date column", () => {
    const db = getDb();
    db.exec(`DROP TABLE projects`);
    db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT, status TEXT)`);
    db.exec(`INSERT INTO projects (id, name, status) VALUES (1, 'Old schema', 'Active')`);
    assert.deepEqual(getCalendarItems("2026-11-01", "2026-11-30", { sources: ["milestone"] }, options), []);
  });

  it("includes project milestones once a milestone_date column exists", () => {
    const db = getDb();
    const columns = (db.prepare("PRAGMA table_info(projects)").all() as { name: string }[]).map((c) => c.name);
    if (!columns.includes("milestone_date")) db.exec(`ALTER TABLE projects ADD COLUMN milestone_date TEXT`);
    db.exec(`INSERT INTO projects (id, name, status, milestone_date) VALUES (5, 'Track', 'Active', '2026-11-22')`);
    const [item] = getCalendarItems("2026-11-22", "2026-11-22", { sources: ["milestone"] }, options);
    assert.equal(item.id, "milestone:5");
    assert.equal(item.category, "Project");
    assert.equal(item.href, "/projects");
    assert.equal(item.title, "Track");
  });

  it("reads important dates from People when that table exists, expanding yearly dates", () => {
    const db = getDb();
    db.exec(`CREATE TABLE important_dates (id INTEGER PRIMARY KEY, name TEXT, date TEXT, kind TEXT, recurrence TEXT)`);
    db.exec(`INSERT INTO important_dates (id, name, date, kind, recurrence) VALUES (1, 'Aarav', '1990-11-20', 'Birthday', 'Yearly')`);
    db.exec(`INSERT INTO important_dates (id, name, date, kind, recurrence) VALUES (2, 'Signing', '2026-11-25', 'Anniversary', 'None')`);
    const items = getCalendarItems("2026-11-01", "2026-11-30", { sources: ["important"] }, options);
    assert.deepEqual(ids(items), ["important:1:2026-11-20", "important:2"]);
    assert.equal(items.find((item) => item.sourceId === 1)?.category, "Birthday");
    assert.equal(items.find((item) => item.sourceId === 2)?.category, "Personal");
  });

  it("ignores an important_dates table that lacks a usable date or title", () => {
    getDb().exec(`CREATE TABLE important_dates (id INTEGER PRIMARY KEY, notes TEXT)`);
    assert.deepEqual(getCalendarItems("2026-11-01", "2026-11-30", { sources: ["important"] }, options), []);
  });
});

describe("range and convenience readers", () => {
  it("refuses inverted or oversized ranges", () => {
    assert.throws(() => getCalendarItems("2026-11-10", "2026-11-01", {}, options), /end on or after/);
    assert.throws(
      () => getCalendarItems("2020-01-01", `2020-01-01`, {}, options) && getCalendarItems("2020-01-01", "2030-01-01", {}, options),
      /limited to \d+ days/,
    );
    assert.ok(MAX_RANGE_DAYS >= 366);
  });

  it("rejects malformed dates", () => {
    assert.throws(() => getCalendarItems("2026-13-01", "2026-13-02", {}, options), /YYYY-MM-DD/);
  });

  it("returns the day's agenda in calendar order: all-day first, then by time", () => {
    const db = getDb();
    db.exec(`INSERT INTO events (id, title, date, start_time) VALUES (1, 'Late', '2026-11-15', '18:00')`);
    db.exec(`INSERT INTO events (id, title, date, start_time) VALUES (2, 'Early', '2026-11-15', '07:30')`);
    db.exec(`INSERT INTO events (id, title, date, all_day) VALUES (3, 'Holiday', '2026-11-15', 1)`);
    assert.deepEqual(
      getAgendaForDate("2026-11-15", options).map((item) => item.title),
      ["Holiday", "Early", "Late"],
    );
  });

  it("lists upcoming items from today, counting today as day one", () => {
    const db = getDb();
    db.exec(`INSERT INTO events (id, title, date) VALUES (1, 'Yesterday', '2026-11-14')`);
    db.exec(`INSERT INTO events (id, title, date) VALUES (2, 'Week', '2026-11-21')`);
    db.exec(`INSERT INTO events (id, title, date) VALUES (3, 'Too far', '2026-11-22')`);
    const upcoming = getUpcomingItems(7, options).map((item) => item.title);
    assert.deepEqual(upcoming, ["Week"]);
  });
});
