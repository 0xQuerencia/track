import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatClock } from "./model";
import {
  calendarHref,
  listSearch,
  parseCalendarQuery,
  rangeForView,
  returnHref,
  shiftDate,
} from "./url";

const TODAY = "2026-11-15";

describe("calendar URL state", () => {
  it("defaults to the month view on today", () => {
    assert.deepEqual(parseCalendarQuery({}, TODAY), {
      view: "month",
      date: TODAY,
      categories: [],
      sources: [],
      event: null,
      isNew: false,
    });
  });

  it("drops unknown views, bad dates, unknown filters and non-numeric ids", () => {
    const query = parseCalendarQuery(
      { view: "galaxy", date: "2026-02-31", cat: "Exam,Hacking,Study", src: "task,root", event: "12abc" },
      TODAY,
    );
    assert.equal(query.view, "month");
    assert.equal(query.date, TODAY, "2026-02-31 is not a real date");
    assert.deepEqual(query.categories, ["Study", "Exam"], "returned in the fixed list order");
    assert.deepEqual(query.sources, ["task"]);
    assert.equal(query.event, null);
  });

  it("reads the first value when a parameter is repeated", () => {
    const query = parseCalendarQuery({ date: ["2026-12-01", "2027-01-01"], new: ["1"] }, TODAY);
    assert.equal(query.date, "2026-12-01");
    assert.equal(query.isNew, true);
  });

  it("builds hrefs with only the state that is set", () => {
    const query = parseCalendarQuery({ view: "week", date: "2026-11-18", cat: "Exam" }, TODAY);
    assert.equal(calendarHref(query), "/calendar?view=week&date=2026-11-18&cat=Exam");
    assert.equal(
      calendarHref(query, { event: 7 }),
      "/calendar?view=week&date=2026-11-18&cat=Exam&event=7",
    );
    assert.equal(listSearch({ ...query, event: 7, isNew: true }), "view=week&date=2026-11-18&cat=Exam");
  });

  it("sends a return target back only to the list, with a safe date", () => {
    assert.equal(
      returnHref("view=day&date=2026-11-20&cat=Exam&event=9&new=1", TODAY, "2026-11-21"),
      "/calendar?view=day&date=2026-11-21&cat=Exam",
    );
    assert.equal(returnHref("view=evil&date=zzz", TODAY), "/calendar?view=month&date=2026-11-15");
    assert.equal(returnHref(null, TODAY), "/calendar?view=month&date=2026-11-15");
  });

  it("shifts by month with the day clamped, and by week or day", () => {
    assert.equal(shiftDate("month", "2027-01-31", 1), "2027-02-28");
    assert.equal(shiftDate("week", "2026-11-15", -1), "2026-11-08");
    assert.equal(shiftDate("day", "2026-12-31", 1), "2027-01-01");
    assert.equal(shiftDate("upcoming", "2026-11-15", 1), "2026-11-15");
  });

  it("gives month views the full six-week grid and upcoming a 30-day window", () => {
    assert.deepEqual(rangeForView("month", "2026-11-15", TODAY), { from: "2026-10-26", to: "2026-12-06" });
    assert.deepEqual(rangeForView("week", "2026-11-18", TODAY), { from: "2026-11-16", to: "2026-11-22" });
    assert.deepEqual(rangeForView("upcoming", "2026-11-18", TODAY), { from: TODAY, to: "2026-12-14" });
  });
});

describe("clock labels", () => {
  it("formats 24-hour times for people", () => {
    assert.equal(formatClock("00:05"), "12:05 AM");
    assert.equal(formatClock("12:00"), "12:00 PM");
    assert.equal(formatClock("14:30"), "2:30 PM");
    assert.equal(formatClock("nope"), "nope");
  });
});
