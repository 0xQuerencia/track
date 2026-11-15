import { getDb } from "../db";
import { isoDate } from "../dates";
import { advanceDue } from "./calc";
import { transactionCategories } from "./queries";

/*
 * "Mark paid" for a recurring item. One transaction per (item, due date):
 * the recurring_payments row is the idempotency key, and the whole step runs
 * in one IMMEDIATE transaction. Repeating the call for a date that is already
 * paid creates nothing and says so.
 */

export type MarkPaidResult =
  | { ok: true; created: boolean; transactionId: number | null; nextDue: string | null }
  | { ok: false; reason: string };

const NOTE_MAX = 200;

/** Records one payment for `dueDate` and moves the item to its next due date. */
export function markRecurringPaid(recurringId: number, dueDate: string): MarkPaidResult {
  if (!Number.isInteger(recurringId) || recurringId <= 0) return { ok: false, reason: "Unknown item." };
  if (!isoDate(dueDate)) return { ok: false, reason: "The due date is not valid." };

  const db = getDb();
  const rollback = (result: MarkPaidResult): MarkPaidResult => {
    db.exec("ROLLBACK");
    return result;
  };
  db.exec("BEGIN IMMEDIATE");
  try {
    const item = db
      .prepare(`SELECT * FROM recurring_expenses WHERE id = ?`)
      .get(recurringId) as
      | { id: number; name: string; category: string | null; amount: number; cadence: string; next_due: string | null; active: number }
      | undefined;
    if (!item) return rollback({ ok: false, reason: "Recurring item not found." });

    const existing = db
      .prepare(`SELECT transaction_id FROM recurring_payments WHERE recurring_id = ? AND due_date = ?`)
      .get(recurringId, dueDate) as { transaction_id: number | null } | undefined;
    if (existing) {
      db.exec("COMMIT");
      return { ok: true, created: false, transactionId: existing.transaction_id, nextDue: item.next_due };
    }

    if (!item.active) return rollback({ ok: false, reason: "This item is paused." });
    if (item.next_due !== dueDate)
      return rollback({ ok: false, reason: "This due date has already moved on. Refresh the page." });

    const categories = transactionCategories();
    const category = item.category && categories.includes(item.category) ? item.category : "Other";
    const transaction = db
      .prepare(
        `INSERT INTO transactions (date, kind, amount, category, note) VALUES (?, 'Expense', ?, ?, ?)`,
      )
      .run(dueDate, Number(item.amount), category, `Recurring: ${item.name}`.slice(0, NOTE_MAX));
    const transactionId = Number(transaction.lastInsertRowid);

    db.prepare(
      `INSERT INTO recurring_payments (recurring_id, due_date, transaction_id) VALUES (?, ?, ?)`,
    ).run(recurringId, dueDate, transactionId);

    const nextDue = advanceDue(dueDate, item.cadence);
    db.prepare(`UPDATE recurring_expenses SET next_due = ? WHERE id = ?`).run(nextDue, recurringId);
    db.exec("COMMIT");
    return { ok: true, created: true, transactionId, nextDue };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Already closed.
    }
    throw error;
  }
}
