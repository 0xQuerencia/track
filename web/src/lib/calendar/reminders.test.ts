import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { closeTestDb } from "../testing/test-db";
import { clearCalendarSources, installCalendarDb } from "./fixtures";
import { getUpcomingReminders } from "./reminders";

const ZONE = "Asia/Kolkata";

beforeEach(() => {
  clearCalendarSources(installCalendarDb());
});
afterEach(() => {
  closeTestDb();
});

describe("in-app reminders", () => {
  it("lists a reminder whose moment falls inside the next 48 hours", () => {
    // 08:30 IST on the 15th; the event starts at 10:00 IST, reminder 30 minutes before.
    getDb().exec(`INSERT INTO events (id, title, date, start_time, reminder_minutes) VALUES (1, 'Mock', '2026-11-15', '10:00', 30)`);
    const reminders = getUpcomingReminders(new Date("2026-11-15T03:00:00Z"), { zone: ZONE });
    assert.equal(reminders.length, 1);
    assert.equal(reminders[0].title, "Mock");
    assert.equal(reminders[0].startsAt, "2026-11-15T04:30:00.000Z");
    assert.equal(reminders[0].remindAt, "2026-11-15T04:00:00.000Z");
    assert.equal(reminders[0].href, "/calendar?event=1");
    assert.ok(reminders[0].remindLabel.length > 0);
  });

  it("leaves out events that have already started", () => {
    getDb().exec(`INSERT INTO events (id, title, date, start_time, reminder_minutes) VALUES (1, 'Started', '2026-11-15', '10:00', 30)`);
    assert.deepEqual(getUpcomingReminders(new Date("2026-11-15T05:00:00Z"), { zone: ZONE }), []);
  });

  it("leaves out reminders that fire beyond the window", () => {
    // Starts 18 Nov 10:00 IST; reminder fires 17 Nov 10:00 IST, outside 48h from 15 Nov 08:30.
    getDb().exec(`INSERT INTO events (id, title, date, start_time, reminder_minutes) VALUES (1, 'Later', '2026-11-18', '10:00', 1440)`);
    assert.deepEqual(getUpcomingReminders(new Date("2026-11-15T03:00:00Z"), { zone: ZONE }), []);
  });

  it("uses 09:00 local for all-day events", () => {
    getDb().exec(`INSERT INTO events (id, title, date, all_day, reminder_minutes) VALUES (1, 'Birthday', '2026-11-16', 1, 0)`);
    const [reminder] = getUpcomingReminders(new Date("2026-11-15T03:00:00Z"), { zone: ZONE });
    assert.equal(reminder.startsAt, "2026-11-16T03:30:00.000Z");
  });

  it("lists each occurrence of a repeating event that falls in the window", () => {
    getDb().exec(
      `INSERT INTO events (id, title, date, start_time, recurrence, reminder_minutes)
       VALUES (1, 'Standup', '2026-11-10', '10:00', 'Daily', 0)`,
    );
    const reminders = getUpcomingReminders(new Date("2026-11-15T03:00:00Z"), { zone: ZONE });
    assert.deepEqual(reminders.map((item) => item.date), ["2026-11-15", "2026-11-16"]);
  });

  it("ignores events without a reminder", () => {
    getDb().exec(`INSERT INTO events (id, title, date, start_time) VALUES (1, 'Quiet', '2026-11-15', '10:00')`);
    assert.deepEqual(getUpcomingReminders(new Date("2026-11-15T03:00:00Z"), { zone: ZONE }), []);
  });

  it("reads 'today' in the calendar zone, so a reminder late on the 14th UTC still counts", () => {
    getDb().exec(`INSERT INTO events (id, title, date, start_time, reminder_minutes) VALUES (1, 'Morning', '2026-11-15', '08:00', 0)`);
    // 19:00 UTC on the 14th is 00:30 on the 15th in Kolkata; the 08:00 start is still ahead.
    const reminders = getUpcomingReminders(new Date("2026-11-14T19:00:00Z"), { zone: ZONE });
    assert.equal(reminders.length, 1);
    assert.equal(reminders[0].date, "2026-11-15");
  });
});
