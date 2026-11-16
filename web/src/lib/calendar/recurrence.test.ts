import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_OCCURRENCES,
  occurrenceStarts,
  occurrencesInRange,
  type RecurringSeries,
} from "./recurrence";

const series = (overrides: Partial<RecurringSeries> & { date: string }): RecurringSeries => ({
  endDate: null,
  recurrence: "None",
  recurrenceUntil: null,
  ...overrides,
});

describe("one-off events", () => {
  it("appear only inside the range", () => {
    const one = series({ date: "2026-11-10" });
    assert.deepEqual(occurrenceStarts(one, "2026-11-01", "2026-11-30"), ["2026-11-10"]);
    assert.deepEqual(occurrenceStarts(one, "2026-11-11", "2026-11-30"), []);
  });
});

describe("daily repeats", () => {
  it("stop after recurrence_until, inclusive", () => {
    const daily = series({ date: "2026-11-10", recurrence: "Daily", recurrenceUntil: "2026-11-12" });
    assert.deepEqual(occurrenceStarts(daily, "2026-11-01", "2026-11-30"), [
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
    ]);
  });

  it("never start before the anchor date", () => {
    const daily = series({ date: "2026-11-10", recurrence: "Daily" });
    assert.deepEqual(occurrenceStarts(daily, "2026-11-08", "2026-11-11"), ["2026-11-10", "2026-11-11"]);
  });
});

describe("weekly repeats", () => {
  it("land on the anchor weekday", () => {
    const weekly = series({ date: "2026-11-02", recurrence: "Weekly" });
    assert.deepEqual(occurrenceStarts(weekly, "2026-11-01", "2026-11-30"), [
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
      "2026-11-30",
    ]);
  });
});

describe("monthly repeats", () => {
  it("clamp the 31st to the last day of shorter months and return to the 31st", () => {
    const monthly = series({ date: "2027-01-31", recurrence: "Monthly" });
    assert.deepEqual(occurrenceStarts(monthly, "2027-01-01", "2027-06-30"), [
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
      "2027-06-30",
    ]);
  });

  it("clamp to Feb 29 in a leap year", () => {
    const monthly = series({ date: "2028-01-31", recurrence: "Monthly" });
    assert.deepEqual(occurrenceStarts(monthly, "2028-02-01", "2028-02-29"), ["2028-02-29"]);
  });

  it("stop at recurrence_until and skip months before the range", () => {
    const monthly = series({ date: "2027-01-15", recurrence: "Monthly", recurrenceUntil: "2027-03-15" });
    assert.deepEqual(occurrenceStarts(monthly, "2027-02-01", "2027-12-31"), ["2027-02-15", "2027-03-15"]);
  });
});

describe("yearly repeats", () => {
  it("move a Feb 29 anchor to Feb 28 in common years and back on leap years", () => {
    const yearly = series({ date: "2028-02-29", recurrence: "Yearly" });
    assert.deepEqual(occurrenceStarts(yearly, "2028-01-01", "2033-12-31"), [
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
      "2031-02-28",
      "2032-02-29",
      "2033-02-28",
    ]);
  });

  it("keep an ordinary date every year", () => {
    const birthday = series({ date: "1990-11-20", recurrence: "Yearly" });
    assert.deepEqual(occurrenceStarts(birthday, "2026-11-01", "2027-11-30"), ["2026-11-20", "2027-11-20"]);
  });
});

describe("range edges", () => {
  it("return nothing when the series ends before the range starts", () => {
    const daily = series({ date: "2026-10-01", recurrence: "Daily", recurrenceUntil: "2026-10-05" });
    assert.deepEqual(occurrenceStarts(daily, "2026-11-01", "2026-11-30"), []);
  });

  it("return nothing when the range ends before the anchor", () => {
    const weekly = series({ date: "2026-12-01", recurrence: "Weekly" });
    assert.deepEqual(occurrenceStarts(weekly, "2026-11-01", "2026-11-30"), []);
  });

  it("cap very long expansions instead of building huge lists", () => {
    const daily = series({ date: "2000-01-01", recurrence: "Daily" });
    assert.equal(occurrenceStarts(daily, "2000-01-01", "2030-01-01").length, MAX_OCCURRENCES);
  });
});

describe("multi-day occurrences", () => {
  it("keep an occurrence that started before the range but still runs into it", () => {
    const trip = series({ date: "2026-11-10", endDate: "2026-11-12", recurrence: "Daily", recurrenceUntil: "2026-11-11" });
    assert.deepEqual(occurrencesInRange(trip, "2026-11-12", "2026-11-12"), [
      { start: "2026-11-10", end: "2026-11-12" },
      { start: "2026-11-11", end: "2026-11-13" },
    ]);
  });

  it("drop an occurrence that has already finished before the range", () => {
    const trip = series({ date: "2026-11-10", endDate: "2026-11-11" });
    assert.deepEqual(occurrencesInRange(trip, "2026-11-12", "2026-11-30"), []);
  });
});
