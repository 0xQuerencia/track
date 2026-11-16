import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { closeTestDb } from "../testing/test-db";
import { createEvent, deleteEvent, getEventRow, updateEvent } from "./events";
import { installCalendarDb } from "./fixtures";
import { normalizeEventInput, parseEventInput, type EventInput } from "./events-schema";

const base = {
  title: "Chem mock test",
  date: "2026-11-20",
  end_date: null,
  all_day: false,
  start_time: "09:00",
  end_time: "12:00",
  category: "Exam",
  location: "Room 4",
  notes: "Bring the formula sheet",
  recurrence: "None",
  recurrence_until: null,
  reminder_minutes: 60,
};

function valid(overrides: Record<string, unknown> = {}): EventInput {
  const parsed = parseEventInput({ ...base, ...overrides });
  if (!parsed.ok) throw new Error(`expected valid input: ${parsed.error}`);
  return parsed.value;
}

function errorFor(overrides: Record<string, unknown>): string {
  const parsed = parseEventInput({ ...base, ...overrides });
  if (parsed.ok) throw new Error("expected the input to be rejected");
  return parsed.error;
}

describe("event input rules", () => {
  it("accepts a complete event and keeps only schema fields", () => {
    const input = valid({ injected_column: "DROP TABLE events" });
    assert.equal(input.title, "Chem mock test");
    assert.ok(!("injected_column" in input));
  });

  it("rejects an end date before the start date", () => {
    assert.match(errorFor({ end_date: "2026-11-19" }), /end date is before the start date/);
  });

  it("rejects an end time before the start time on the same day", () => {
    assert.match(errorFor({ end_time: "08:30" }), /end time is before the start time/);
  });

  it("allows an end time earlier than the start time when the event ends on a later day", () => {
    const input = valid({ end_date: "2026-11-21", end_time: "08:30" });
    assert.equal(input.end_time, "08:30");
  });

  it("rejects an end time without a start time", () => {
    assert.match(errorFor({ start_time: "", end_time: "10:00" }), /start time before an end time/);
  });

  it("rejects a repeat-until date before the first day", () => {
    assert.match(
      errorFor({ recurrence: "Weekly", recurrence_until: "2026-11-01" }),
      /repeat-until date is before the start date/,
    );
  });

  it("rejects an until date when nothing repeats", () => {
    assert.match(errorFor({ recurrence_until: "2026-12-01" }), /Choose a repeat before/);
  });

  it("rejects impossible dates and years outside the supported range", () => {
    assert.match(errorFor({ date: "2026-02-30" }), /real date/);
    assert.match(errorFor({ date: "1960-01-01" }), /real date/);
  });

  it("rejects an event spanning more than a year", () => {
    assert.match(errorFor({ end_date: "2027-11-25" }), /at most a year/);
  });

  it("rejects unknown categories, repeat options and malformed times", () => {
    assert.match(errorFor({ category: "Hacking" }), /category/);
    assert.match(errorFor({ recurrence: "Hourly" }), /repeat option/);
    assert.match(errorFor({ start_time: "9am" }), /09:30/);
  });

  it("rejects a blank title and out-of-range reminders", () => {
    assert.match(errorFor({ title: "   " }), /title/);
    assert.match(errorFor({ reminder_minutes: 99999 }), /a week ahead/);
    assert.match(errorFor({ reminder_minutes: 1.5 }), /whole minutes/);
  });

  it("rejects input that is not an object", () => {
    assert.equal(parseEventInput("hello").ok, false);
    assert.equal(parseEventInput(null).ok, false);
  });

  it("turns blank optional fields into null and form strings into numbers", () => {
    const input = valid({ end_date: "", location: "", notes: "", reminder_minutes: "15" });
    assert.equal(input.end_date, null);
    assert.equal(input.location, null);
    assert.equal(input.notes, null);
    assert.equal(input.reminder_minutes, 15);
  });

  it("clears clock times for all-day events", () => {
    const input = valid({ all_day: "on", start_time: "09:00", end_time: "10:00" });
    assert.equal(input.all_day, true);
    assert.equal(input.start_time, null);
    assert.equal(input.end_time, null);
  });

  it("reads checkbox values the way a form sends them", () => {
    assert.equal(normalizeEventInput({ all_day: "on" }).all_day, true);
    assert.equal(normalizeEventInput({}).all_day, false);
    assert.equal(normalizeEventInput({}).recurrence, "None");
  });
});

describe("event persistence", () => {
  beforeEach(() => {
    installCalendarDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("creates, reads back and updates an event", () => {
    const id = createEvent(valid({ recurrence: "Monthly", recurrence_until: "2027-03-31" }));
    const row = getEventRow(id);
    assert.ok(row);
    assert.equal(row.title, "Chem mock test");
    assert.equal(row.recurrence, "Monthly");
    assert.equal(row.recurrence_until, "2027-03-31");
    assert.equal(row.all_day, 0);

    assert.equal(updateEvent(id, valid({ title: "Chem mock test (moved)", date: "2026-11-21", end_date: null, start_time: null, end_time: null, all_day: true })), true);
    const moved = getEventRow(id);
    assert.equal(moved?.title, "Chem mock test (moved)");
    assert.equal(moved?.date, "2026-11-21");
    assert.equal(moved?.all_day, 1);
    assert.equal(moved?.start_time, null);
  });

  it("reports missing ids on update and delete instead of throwing", () => {
    assert.equal(updateEvent(9999, valid()), false);
    assert.equal(deleteEvent(9999), false);
    assert.equal(getEventRow(9999), undefined);
  });

  it("deletes an event", () => {
    const id = createEvent(valid());
    assert.equal(deleteEvent(id), true);
    assert.equal(getEventRow(id), undefined);
  });

  it("stores values as parameters, so hostile text stays inert", () => {
    const hostile = "Robert'); DROP TABLE events; --";
    const id = createEvent(valid({ title: hostile }));
    assert.equal(getEventRow(id)?.title, hostile);
    assert.ok(getEventRow(id), "table still exists");
  });
});
