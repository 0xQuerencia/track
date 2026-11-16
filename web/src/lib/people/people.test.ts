import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { closeTestDb, installTestDb } from "../testing/test-db";
import { parseBirthday, monthDayOf } from "./birthday";
import { getUpcomingImportantDates } from "./index";
import { occurrenceInYear, occurrencesBetween, daysInMonth, isLeapYear } from "./occurrences";
import {
  createImportantDate,
  createPerson,
  deletePerson,
  parseImportantDateForm,
  parsePersonForm,
  updateImportantDate,
} from "./repo";
import { cleanTerm, getPerson, listImportantDates, listPeople } from "./queries";

describe("occurrence arithmetic", () => {
  it("knows leap years and month lengths", () => {
    assert.equal(isLeapYear(2024), true);
    assert.equal(isLeapYear(2100), false);
    assert.equal(isLeapYear(2000), true);
    assert.equal(daysInMonth(2025, 2), 28);
    assert.equal(daysInMonth(2024, 2), 29);
    assert.equal(daysInMonth(2026, 4), 30);
  });

  it("maps February 29 to February 28 in non-leap years and keeps it in leap years", () => {
    const leapDay = { month: 2, day: 29 };
    assert.equal(occurrenceInYear(leapDay, 2025), "2025-02-28");
    assert.equal(occurrenceInYear(leapDay, 2028), "2028-02-29");
  });

  it("finds yearly occurrences in a window that spans years", () => {
    const occ = occurrencesBetween({ month: 3, day: 1 }, "2026-11-01", "2027-04-30");
    assert.deepEqual(occ, ["2027-03-01"]);
  });

  it("finds the leap-day occurrence in each year of a window, using Feb 28 in non-leap years", () => {
    const occ = occurrencesBetween({ month: 2, day: 29 }, "2025-01-01", "2028-12-31");
    assert.deepEqual(occ, ["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });

  it("does not produce occurrences before the first real date", () => {
    const occ = occurrencesBetween({ month: 5, day: 1 }, "2026-01-01", "2026-12-31", "2030-01-01");
    assert.deepEqual(occ, []);
  });

  it("returns nothing for an inverted window", () => {
    assert.deepEqual(occurrencesBetween({ month: 1, day: 1 }, "2026-02-01", "2026-01-01"), []);
  });
});

describe("birthday parsing", () => {
  it("accepts MM-DD and YYYY-MM-DD, including Feb 29", () => {
    assert.deepEqual(parseBirthday("06-15"), { ok: true, value: "06-15" });
    assert.deepEqual(parseBirthday("02-29"), { ok: true, value: "02-29" });
    assert.deepEqual(parseBirthday("1996-02-29"), { ok: true, value: "1996-02-29" });
    assert.deepEqual(parseBirthday(""), { ok: true, value: null });
    assert.deepEqual(parseBirthday("   "), { ok: true, value: null });
  });

  it("rejects dates that do not exist and malformed text", () => {
    assert.equal(parseBirthday("02-30").ok, false);
    assert.equal(parseBirthday("13-01").ok, false);
    assert.equal(parseBirthday("2023-02-29").ok, false, "2023 is not a leap year");
    assert.equal(parseBirthday("1899-01-01").ok, false, "year before the allowed range");
    assert.equal(parseBirthday("June 15").ok, false);
    assert.equal(parseBirthday("15-06-1990").ok, false);
  });

  it("reads month and day from either form", () => {
    assert.deepEqual(monthDayOf("06-15"), { month: 6, day: 15 });
    assert.deepEqual(monthDayOf("1990-12-01"), { month: 12, day: 1 });
  });
});

describe("people and important dates", () => {
  beforeEach(() => {
    installTestDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("merges birthdays and saved dates into one calendar feed, in date order", () => {
    const ada = createPerson({ name: "Ada", birthday: "03-10", tags: "maths" });
    createPerson({ name: "No Date", birthday: null });
    createImportantDate({ title: "Club anniversary", date: "2020-03-12", kind: "Anniversary", repeat_yearly: 1, person_id: ada });
    createImportantDate({ title: "One-off", date: "2026-03-20", kind: "Other", repeat_yearly: 0 });
    createImportantDate({ title: "Outside", date: "2027-01-01", kind: "Other", repeat_yearly: 0 });

    const items = getUpcomingImportantDates("2026-03-01", "2026-03-31");
    assert.deepEqual(
      items.map((i) => [i.date, i.title, i.source]),
      [
        ["2026-03-10", "Ada's birthday", "birthday"],
        ["2026-03-12", "Club anniversary", "important_date"],
        ["2026-03-20", "One-off", "important_date"],
      ],
    );
    const birthday = items[0];
    assert.equal(birthday.personId, ada);
    assert.equal(birthday.href, `/people/${ada}`);
    assert.equal(items[1].href, `/people#important_dates-${items[1].id}`);
  });

  it("expands a yearly date over a multi-year window, and skips it before its first year", () => {
    createImportantDate({ title: "Wedding", date: "2026-07-04", kind: "Anniversary", repeat_yearly: 1 });
    const items = getUpcomingImportantDates("2026-01-01", "2028-12-31");
    assert.deepEqual(items.map((i) => i.date), ["2026-07-04", "2027-07-04", "2028-07-04"]);
    const earlier = getUpcomingImportantDates("2025-01-01", "2025-12-31");
    assert.deepEqual(earlier, []);
  });

  it("gives a leap-day birthday an occurrence every year", () => {
    createPerson({ name: "Leap", birthday: "02-29" });
    const items = getUpcomingImportantDates("2027-02-01", "2028-03-01");
    assert.deepEqual(items.map((i) => i.date), ["2027-02-28", "2028-02-29"]);
  });

  it("returns nothing for invalid bounds", () => {
    assert.deepEqual(getUpcomingImportantDates("bad", "2026-03-01"), []);
    assert.deepEqual(getUpcomingImportantDates("2026-03-02", "2026-03-01"), []);
  });

  it("clears the person on a dated entry when the person is deleted, and keeps the date", () => {
    const id = createPerson({ name: "Temp", birthday: null });
    const date = createImportantDate({ title: "Lunch", date: "2026-05-05", person_id: id, repeat_yearly: 0 });
    deletePerson(id);
    assert.equal(getPerson(id), null);
    const row = listImportantDates().find((d) => d.id === date);
    assert.ok(row);
    assert.equal(row.person_id, null);
  });

  it("filters people by search text and by a whole tag", () => {
    createPerson({ name: "Ravi", tags: "chess, school", relationship: "friend" });
    createPerson({ name: "Mina", tags: "schoolmate", relationship: "classmate" });
    createPerson({ name: "Zed", tags: null, notes: "100% sure" });

    assert.deepEqual(listPeople({ q: "class", tag: "" }, 1).rows.map((r) => r.name), ["Mina"]);
    assert.deepEqual(listPeople({ q: "", tag: "school" }, 1).rows.map((r) => r.name), ["Ravi"]);
    assert.deepEqual(listPeople({ q: "", tag: "chess" }, 1).rows.map((r) => r.name), ["Ravi"]);
    assert.deepEqual(listPeople({ q: "100%", tag: "" }, 1).rows.map((r) => r.name), ["Zed"]);
    assert.equal(listPeople({ q: "_", tag: "" }, 1).total, 0, "underscore is literal, not a wildcard");
    assert.equal(cleanTerm("  spaced  "), "spaced");
  });

  it("validates the person form and rejects a bad birthday before writing", () => {
    const bad = new FormData();
    bad.set("name", "Test");
    bad.set("birthday", "02-31");
    assert.ok("error" in parsePersonForm(bad));

    const good = new FormData();
    good.set("name", "Test");
    good.set("birthday", "1988-12-25");
    good.set("tags", "a, b, a");
    const parsed = parsePersonForm(good);
    assert.ok("values" in parsed);
    assert.equal(parsed.values.birthday, "1988-12-25");
    assert.equal(parsed.values.tags, "a, b", "duplicate tags are collapsed");
  });

  it("refuses a person reference that does not exist, and a non-integer reminder", () => {
    const form = new FormData();
    form.set("title", "Call");
    form.set("date", "2026-06-01");
    form.set("person_id", "999");
    assert.ok("error" in parseImportantDateForm(form));

    const pid = createPerson({ name: "Exists", birthday: null });
    const withPerson = new FormData();
    withPerson.set("title", "Call");
    withPerson.set("date", "2026-06-01");
    withPerson.set("person_id", String(pid));
    withPerson.set("remind_days_before", "2.5");
    assert.ok("error" in parseImportantDateForm(withPerson));
  });

  it("updates a saved date", () => {
    const id = createImportantDate({ title: "Old", date: "2026-01-01", repeat_yearly: 0 });
    assert.equal(updateImportantDate(id, { title: "New", date: "2026-01-02", repeat_yearly: 1, kind: "Deadline" }), true);
    const row = listImportantDates().find((d) => d.id === id);
    assert.equal(row?.title, "New");
    assert.equal(row?.repeat_yearly, 1);
  });

  it("refuses a malformed birthday written directly to the table", () => {
    assert.throws(() =>
      getDb().prepare("INSERT INTO people (name, birthday) VALUES (?, ?)").run("Bad", "June"),
    );
  });
});
