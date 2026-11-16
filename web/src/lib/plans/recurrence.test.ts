import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMonths, firstOccurrenceAfter, nextOccurrence } from "./recurrence";

const TODAY = "2026-11-15"; // a Sunday

describe("recurrence: next occurrence", () => {
  it("repeats daily from the completed due date", () => {
    assert.equal(nextOccurrence("2026-11-10", "Daily", TODAY), "2026-11-16");
  });

  it("keeps a future due date as the base for the next one", () => {
    assert.equal(nextOccurrence("2026-11-20", "Daily", TODAY), "2026-11-21");
  });

  it("skips past weekly occurrences so the new one is strictly after today", () => {
    assert.equal(nextOccurrence("2026-11-02", "Weekly", TODAY), "2026-11-16");
    assert.equal(nextOccurrence("2026-11-02", "Weekly", "2026-11-02"), "2026-11-09");
  });

  it("lands on the next Monday for weekday repeats completed on a weekend", () => {
    assert.equal(nextOccurrence("2026-11-13", "Weekdays", TODAY), "2026-11-16");
    assert.equal(nextOccurrence("2026-11-14", "Weekdays", "2026-11-14"), "2026-11-16");
  });

  it("clamps monthly repeats to the end of a short month", () => {
    assert.equal(nextOccurrence("2026-01-31", "Monthly", "2026-02-15"), "2026-02-28");
    assert.equal(nextOccurrence("2026-01-31", "Monthly", "2026-02-28"), "2026-03-31");
  });

  it("returns null when the next date is past the repeat-until date", () => {
    assert.equal(nextOccurrence("2026-11-10", "Daily", TODAY, "2026-11-15"), null);
    assert.equal(nextOccurrence("2026-11-10", "Daily", TODAY, "2026-11-20"), "2026-11-16");
  });

  it("never repeats a task set to None", () => {
    assert.equal(nextOccurrence("2026-11-10", "None", TODAY), null);
  });

  it("finds the next date after a long gap without looping forever", () => {
    assert.equal(firstOccurrenceAfter("2023-01-01", "Daily", TODAY), "2026-11-16");
  });
});

describe("recurrence: addMonths", () => {
  it("clamps to the last day of the target month", () => {
    assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
    assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
    assert.equal(addMonths("2026-11-30", 3), "2027-02-28");
  });

  it("crosses year boundaries", () => {
    assert.equal(addMonths("2026-11-15", 2), "2027-01-15");
  });
});
