import type { SQLInputValue } from "node:sqlite";
import { getDb } from "../db";
import { getEntity } from "../entities";
import { listRows, type Row } from "../crud";
import { monthRange, toPaise } from "./format";
import type { TransactionExportRow } from "./csv";

/*
 * Money reads. Table and column names are fixed strings here; request values
 * are only bound as parameters. Sums are converted to integer paise per row.
 */

const all = <T>(sql: string, ...params: SQLInputValue[]): T[] =>
  getDb()
    .prepare(sql)
    .all(...params)
    // node:sqlite rows have a null prototype; client components need plain objects.
    .map((row) => ({ ...row })) as T[];

/** The spending categories the transactions form offers. */
export function transactionCategories(): readonly string[] {
  return getEntity("transactions")?.fields.find((f) => f.name === "category")?.options ?? [];
}

/** Expense totals per category for one month, in paise. */
export function spendByCategory(month: string): Map<string, number> {
  const { start, end } = monthRange(month);
  const rows = all<{ category: string | null; total: number }>(
    `SELECT category, SUM(amount) AS total FROM transactions
     WHERE kind = 'Expense' AND date >= ? AND date < ?
     GROUP BY category`,
    start,
    end,
  );
  return new Map(rows.map((row) => [row.category ?? "Other", toPaise(Number(row.total) || 0)]));
}

/** Income and expense totals for one month, in paise. */
export function monthTotalsPaise(month: string): { incomePaise: number; expensePaise: number } {
  const { start, end } = monthRange(month);
  const rows = all<{ kind: string; total: number }>(
    `SELECT kind, SUM(amount) AS total FROM transactions
     WHERE date >= ? AND date < ? GROUP BY kind`,
    start,
    end,
  );
  const sum = (kind: string) =>
    rows.filter((row) => row.kind === kind).reduce((acc, row) => acc + toPaise(Number(row.total) || 0), 0);
  return { incomePaise: sum("Income"), expensePaise: sum("Expense") };
}

/** Budget amounts for one month, keyed by category, in paise. */
export function budgetsForMonth(month: string): Map<string, number> {
  const rows = all<{ category: string; amount: number }>(
    `SELECT category, amount FROM budgets WHERE month = ?`,
    month,
  );
  return new Map(rows.map((row) => [row.category, toPaise(Number(row.amount) || 0)]));
}

/** Sum of savings goals: saved and target, in paise. */
export function savingsTotalsPaise(): { savedPaise: number; targetPaise: number; goals: number } {
  const rows = all<{ saved: number | null; target: number | null }>(
    `SELECT saved, target FROM savings_goals`,
  );
  return {
    savedPaise: rows.reduce((acc, row) => acc + toPaise(Number(row.saved) || 0), 0),
    targetPaise: rows.reduce((acc, row) => acc + toPaise(Number(row.target) || 0), 0),
    goals: rows.length,
  };
}

/** Recurring items, active first, soonest due first. */
export function recurringItems(): Row[] {
  return listRows("recurring_expenses");
}

/** Income sources, active first. */
export function incomeSources(): Row[] {
  return listRows("income_sources");
}

/** Transactions in an inclusive date range, oldest first, with the project name joined in. */
export function transactionsBetween(from: string, to: string, limit: number): TransactionExportRow[] {
  return all<TransactionExportRow>(
    `SELECT t.date AS date, t.kind AS kind, t.amount AS amount, t.category AS category,
            t.note AS note, p.name AS project
     FROM transactions t
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.date >= ? AND t.date <= ?
     ORDER BY t.date, t.id
     LIMIT ?`,
    from,
    to,
    limit,
  );
}

/** Count of transactions in a range, used to refuse oversized exports up front. */
export function countTransactionsBetween(from: string, to: string): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM transactions WHERE date >= ? AND date <= ?`)
    .get(from, to) as { n: number };
  return Number(row.n) || 0;
}

/** Project options for the transaction picker. */
export function projectChoices(): { id: number; name: string }[] {
  return all<{ id: number; name: string }>(
    `SELECT id, name FROM projects ORDER BY name COLLATE NOCASE, id LIMIT 500`,
  );
}

/** Income and expense for each "YYYY-MM" in `months`, in the order given. */
export function monthlySeries(
  months: readonly string[],
): { month: string; incomePaise: number; expensePaise: number }[] {
  return months.map((month) => ({ month, ...monthTotalsPaise(month) }));
}
