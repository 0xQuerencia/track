import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { installTestDb, closeTestDb } from "../testing/test-db";
import { getMoneySnapshot } from "./index";
import { markRecurringPaid } from "./recurring";
import { transactionsBetween } from "./queries";

beforeEach(() => {
  installTestDb();
});
afterEach(() => {
  closeTestDb();
});
after(() => {
  closeTestDb();
});

function insertRecurring(overrides: Partial<Record<string, string | number>> = {}): number {
  const row = {
    name: "Music service",
    category: "Subscriptions",
    amount: 119,
    cadence: "Monthly",
    next_due: "2026-11-01",
    active: 1,
    is_subscription: 1,
    ...overrides,
  };
  const result = getDb()
    .prepare(
      `INSERT INTO recurring_expenses (name, category, amount, cadence, next_due, active, is_subscription)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(row.name, row.category, row.amount, row.cadence, row.next_due, row.active, row.is_subscription);
  return Number(result.lastInsertRowid);
}

function countRecurringTransactions(): number {
  return (
    getDb()
      .prepare(`SELECT COUNT(*) AS n FROM transactions WHERE note = 'Recurring: Music service'`)
      .get() as { n: number }
  ).n;
}

describe("markRecurringPaid", () => {
  it("records one transaction per due date and advances the schedule", () => {
    const id = insertRecurring();
    const first = markRecurringPaid(id, "2026-11-01");
    assert.equal(first.ok && first.created, true);
    assert.equal(first.ok && first.nextDue, "2026-12-01");
    assert.equal(countRecurringTransactions(), 1);
  });

  it("is idempotent: repeating the same due date creates nothing new", () => {
    const id = insertRecurring();
    const first = markRecurringPaid(id, "2026-11-01");
    const again = markRecurringPaid(id, "2026-11-01");
    assert.equal(again.ok && again.created, false);
    assert.equal(again.ok && again.transactionId, first.ok && first.transactionId);
    assert.equal(countRecurringTransactions(), 1);
  });

  it("refuses a stale due date once the schedule has moved on", () => {
    const id = insertRecurring();
    markRecurringPaid(id, "2026-11-01");
    const stale = markRecurringPaid(id, "2026-10-01");
    assert.equal(stale.ok, false);
  });

  it("pays the next period when its date comes", () => {
    const id = insertRecurring();
    markRecurringPaid(id, "2026-11-01");
    const next = markRecurringPaid(id, "2026-12-01");
    assert.equal(next.ok && next.created, true);
    assert.equal(countRecurringTransactions(), 2);
  });

  it("refuses a paused item and an unknown item, writing nothing", () => {
    const paused = insertRecurring({ active: 0 });
    assert.equal(markRecurringPaid(paused, "2026-11-01").ok, false);
    assert.equal(markRecurringPaid(9999, "2026-11-01").ok, false);
    assert.equal(countRecurringTransactions(), 0);
  });

  it("rejects an invalid due date", () => {
    const id = insertRecurring();
    assert.equal(markRecurringPaid(id, "2026-02-30").ok, false);
  });
});

describe("getMoneySnapshot", () => {
  it("sums paise exactly and reports budget use and over-budget categories", () => {
    const db = getDb();
    const insert = db.prepare(
      `INSERT INTO transactions (date, kind, amount, category, note) VALUES (?, ?, ?, ?, ?)`,
    );
    insert.run("2026-11-02", "Income", 1000.1, "Allowance", "Monthly");
    insert.run("2026-11-03", "Expense", 250.05, "Food", "Lunch");
    insert.run("2026-11-04", "Expense", 100.1, "Food", "Snacks");
    insert.run("2026-11-10", "Expense", 500, "Transport", "Bus pass");
    insert.run("2026-10-31", "Expense", 9999, "Food", "Outside the month");
    db.prepare(`INSERT INTO budgets (month, category, amount) VALUES ('2026-11', 'Food', 300)`).run();
    db.prepare(
      `INSERT INTO savings_goals (name, target, saved) VALUES ('Laptop', 10000, 2500)`,
    ).run();
    insertRecurring({ amount: 119, cadence: "Monthly" });

    const snapshot = getMoneySnapshot("2026-11");
    assert.equal(snapshot.income, 1000.1);
    assert.equal(snapshot.spent, 850.15);
    assert.equal(snapshot.net, 149.95);
    assert.equal(snapshot.budget.total, 300);
    assert.equal(snapshot.budget.spentInBudgeted, 350.15);
    assert.equal(snapshot.budget.percentUsed, 117);
    assert.equal(snapshot.budget.overCategories, 1);
    assert.deepEqual(
      snapshot.topCategories.map((c) => [c.category, c.spent]),
      [
        ["Transport", 500],
        ["Food", 350.15],
      ],
    );
    assert.equal(snapshot.savings.percent, 25);
    assert.equal(snapshot.recurringMonthly, 119);
  });

  it("reports no budget as null rather than zero", () => {
    const snapshot = getMoneySnapshot("2026-11");
    assert.equal(snapshot.budget.total, null);
    assert.equal(snapshot.budget.percentUsed, null);
    assert.equal(snapshot.savings.percent, null);
  });
});

describe("transactionsBetween (export source)", () => {
  it("joins the project name and returns rows in date order", () => {
    const db = getDb();
    db.prepare(`INSERT INTO projects (name, status) VALUES ('TableTap', 'Active')`).run();
    const projectId = (db.prepare(`SELECT id FROM projects WHERE name = 'TableTap'`).get() as { id: number }).id;
    db.prepare(
      `INSERT INTO transactions (date, kind, amount, category, note, project_id) VALUES (?, 'Income', 5000, 'Gift', 'Client', ?)`,
    ).run("2026-11-05", projectId);
    db.prepare(
      `INSERT INTO transactions (date, kind, amount, category, note) VALUES ('2026-11-01', 'Expense', 20, 'Food', 'Tea')`,
    ).run();

    const rows = transactionsBetween("2026-11-01", "2026-11-30", 100);
    assert.deepEqual(
      rows.map((row) => [row.date, row.project]),
      [
        ["2026-11-01", null],
        ["2026-11-05", "TableTap"],
      ],
    );
  });
});
