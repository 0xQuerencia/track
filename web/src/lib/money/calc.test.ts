import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { advanceDue, budgetLines, monthlyPaise, percentUsed } from "./calc";

describe("advanceDue", () => {
  it("moves weekly items seven days, across a year boundary", () => {
    assert.equal(advanceDue("2026-12-28", "Weekly"), "2027-01-04");
  });

  it("clamps monthly items to the end of a shorter month", () => {
    assert.equal(advanceDue("2027-01-31", "Monthly"), "2027-02-28");
    assert.equal(advanceDue("2028-01-31", "Monthly"), "2028-02-29");
    assert.equal(advanceDue("2026-11-15", "Monthly"), "2026-12-15");
  });

  it("moves quarterly and yearly items by three and twelve months", () => {
    assert.equal(advanceDue("2026-11-30", "Quarterly"), "2027-02-28");
    assert.equal(advanceDue("2028-02-29", "Yearly"), "2029-02-28");
  });

  it("refuses an unknown cadence rather than guessing", () => {
    assert.throws(() => advanceDue("2026-11-01", "Daily"), RangeError);
  });
});

describe("monthlyPaise", () => {
  it("converts each cadence to a monthly equivalent in whole paise", () => {
    assert.equal(monthlyPaise(100000, "Monthly"), 100000);
    assert.equal(monthlyPaise(100000, "Quarterly"), 33333);
    assert.equal(monthlyPaise(100000, "Yearly"), 8333);
    assert.equal(monthlyPaise(100000, "Weekly"), 433333);
  });

  it("rounds to the paisa and never returns a fraction", () => {
    for (const cadence of ["Weekly", "Monthly", "Quarterly", "Yearly"])
      assert.equal(Number.isInteger(monthlyPaise(12345, cadence)), true, cadence);
  });

  it("refuses an unknown cadence", () => {
    assert.throws(() => monthlyPaise(100, "Hourly"), RangeError);
  });
});

describe("budgetLines and percentUsed", () => {
  it("flags only categories whose spending is above a set budget", () => {
    const budgets = new Map([
      ["Food", 30000],
      ["Games", 10000],
    ]);
    const spent = new Map([
      ["Food", 35015],
      ["Games", 10000],
      ["Transport", 4000],
    ]);
    const lines = budgetLines(budgets, spent, ["Food", "Transport", "Games"]);
    assert.deepEqual(
      lines.map((line) => [line.category, line.over]),
      [
        ["Food", true],
        ["Transport", false],
        ["Games", false],
      ],
    );
    const food = lines[0];
    assert.equal(food.remainingPaise, -5015);
    assert.equal(food.percent, 117);
  });

  it("shows spending without a budget as having no percent and no remaining", () => {
    const [line] = budgetLines(new Map(), new Map([["Gift", 500]]), []);
    assert.equal(line.budgetPaise, null);
    assert.equal(line.remainingPaise, null);
    assert.equal(line.over, false);
    assert.equal(line.percent, null);
  });

  it("orders known categories first, then the rest alphabetically", () => {
    const lines = budgetLines(
      new Map([["Zebra", 1]]),
      new Map([["Apple", 1]]),
      ["Food", "Zebra"],
    );
    assert.deepEqual(lines.map((line) => line.category), ["Zebra", "Apple"]);
  });

  it("returns null percent for a zero or missing budget", () => {
    assert.equal(percentUsed(500, 0), null);
    assert.equal(percentUsed(500, null), null);
    assert.equal(percentUsed(500, 1000), 50);
  });
});
