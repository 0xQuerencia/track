import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  addDays,
  addMonths,
  calendarTimeZone,
  dayDiff,
  daysInMonth,
  monthGridDays,
  startOfWeek,
  todayIn,
  weekdayIndex,
  zonedTimeToInstant,
} from "./time";

const saved = { TRACK_TIMEZONE: process.env.TRACK_TIMEZONE, TRACK_TZ: process.env.TRACK_TZ };
afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("calendar time zone", () => {
  it("defaults to Asia/Kolkata when nothing is configured", () => {
    assert.equal(calendarTimeZone({}), "Asia/Kolkata");
  });

  it("prefers TRACK_TIMEZONE, then TRACK_TZ", () => {
    assert.equal(calendarTimeZone({ TRACK_TIMEZONE: "Europe/London", TRACK_TZ: "UTC" }), "Europe/London");
    assert.equal(calendarTimeZone({ TRACK_TZ: "UTC" }), "UTC");
  });

  it("refuses an unknown zone name instead of guessing", () => {
    assert.throws(() => calendarTimeZone({ TRACK_TIMEZONE: "Mars/Olympus" }), /Invalid calendar time zone/);
  });
});

describe("today in a zone", () => {
  it("rolls over at local midnight in Asia/Kolkata, not at UTC midnight", () => {
    // 18:29:59 UTC is 23:59:59 in Kolkata (UTC+5:30): still the 14th there.
    assert.equal(todayIn("Asia/Kolkata", new Date("2026-11-14T18:29:59Z")), "2026-11-14");
    // 18:30:00 UTC is 00:00 on the 15th in Kolkata.
    assert.equal(todayIn("Asia/Kolkata", new Date("2026-11-14T18:30:00Z")), "2026-11-15");
  });

  it("reads the same instant as the previous day in a zone behind UTC", () => {
    assert.equal(todayIn("America/New_York", new Date("2026-11-15T02:00:00Z")), "2026-11-14");
    assert.equal(todayIn("UTC", new Date("2026-11-15T02:00:00Z")), "2026-11-15");
  });
});

describe("wall-clock to instant", () => {
  it("converts Kolkata wall time to UTC", () => {
    assert.equal(
      zonedTimeToInstant("2026-11-15", "10:00", "Asia/Kolkata"),
      Date.parse("2026-11-15T04:30:00Z"),
    );
  });

  it("uses the offset in force on that date across a DST change", () => {
    // New York starts DST on 2026-03-08 at 02:00 local, so 12:00 that day is EDT (UTC-4).
    assert.equal(
      zonedTimeToInstant("2026-03-08", "12:00", "America/New_York"),
      Date.parse("2026-03-08T16:00:00Z"),
    );
    // The day before is still EST (UTC-5).
    assert.equal(
      zonedTimeToInstant("2026-03-07", "12:00", "America/New_York"),
      Date.parse("2026-03-07T17:00:00Z"),
    );
  });
});

describe("date arithmetic", () => {
  it("handles leap and common February lengths, including the century rule", () => {
    assert.equal(daysInMonth(2028, 2), 29);
    assert.equal(daysInMonth(2027, 2), 28);
    assert.equal(daysInMonth(2000, 2), 29);
    assert.equal(daysInMonth(2100, 2), 28);
    assert.equal(daysInMonth(2026, 12), 31);
  });

  it("crosses month and year boundaries", () => {
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2027-01-01", -1), "2026-12-31");
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  });

  it("clamps addMonths to the target month's last day, both directions", () => {
    assert.equal(addMonths("2027-01-31", 1), "2027-02-28");
    assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
    assert.equal(addMonths("2027-03-31", -1), "2027-02-28");
    assert.equal(addMonths("2026-12-15", 1), "2027-01-15");
  });

  it("counts whole days regardless of month edges", () => {
    assert.equal(dayDiff("2027-02-28", "2027-03-01"), 1);
    assert.equal(dayDiff("2028-02-28", "2028-03-01"), 2);
    assert.equal(dayDiff("2026-11-15", "2026-11-01"), -14);
  });

  it("starts weeks on Monday", () => {
    assert.equal(weekdayIndex("2026-11-16"), 0);
    assert.equal(weekdayIndex("2026-11-22"), 6);
    assert.equal(startOfWeek("2026-11-18"), "2026-11-16");
    assert.equal(startOfWeek("2026-11-16"), "2026-11-16");
  });

  it("builds a six-week grid that covers the whole month", () => {
    const days = monthGridDays("2026-11-15");
    assert.equal(days.length, 42);
    assert.equal(weekdayIndex(days[0]), 0, "grid starts on a Monday");
    assert.ok(days.includes("2026-11-01"));
    assert.ok(days.includes("2026-11-30"));
    assert.equal(days[41], "2026-12-06");
  });
});
