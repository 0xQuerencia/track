import { budgetLines, monthlyPaise, percentUsed, type BudgetLine } from "./calc";
import { fromPaise, toPaise } from "./format";
import {
  budgetsForMonth,
  monthTotalsPaise,
  recurringItems,
  savingsTotalsPaise,
  spendByCategory,
  transactionCategories,
} from "./queries";

export { CURRENCY, formatMoney, fromPaise, isMonth, monthRange, toPaise } from "./format";
export { advanceDue, budgetLines, monthlyPaise, percentUsed } from "./calc";
export type { BudgetLine } from "./calc";
export { markRecurringPaid } from "./recurring";
export { buildCsv, escapeCsvCell, transactionsCsv } from "./csv";

export type MoneySnapshot = {
  month: string;
  /** All amounts are rupees (converted from integer paise for the caller). */
  income: number;
  spent: number;
  net: number;
  budget: {
    /** Sum of the budgets set for this month. Null when none are set. */
    total: number | null;
    /** Spending in the categories that have a budget. */
    spentInBudgeted: number;
    /** Whole percent of the total budget used. Null when no budget is set. */
    percentUsed: number | null;
    overCategories: number;
  };
  topCategories: { category: string; spent: number }[];
  savings: { saved: number; target: number; percent: number | null; goals: number };
  /** Monthly equivalent of active recurring items. */
  recurringMonthly: number;
  categories: BudgetLine[];
};

const TOP_CATEGORIES = 5;

/**
 * Everything the Money overview needs for one month, from real transactions,
 * budgets, goals and recurring items. Pure reads; nothing is written.
 */
export function getMoneySnapshot(month: string): MoneySnapshot {
  const totals = monthTotalsPaise(month);
  const spent = spendByCategory(month);
  const budgets = budgetsForMonth(month);
  const lines = budgetLines(budgets, spent, transactionCategories());

  const budgetedPaise = [...budgets.values()].reduce((acc, value) => acc + value, 0);
  const spentInBudgetedPaise = [...budgets.keys()].reduce((acc, key) => acc + (spent.get(key) ?? 0), 0);
  const savings = savingsTotalsPaise();
  const recurringMonthlyPaise = recurringItems()
    .filter((item) => Number(item.active) === 1)
    .reduce(
      (acc, item) =>
        acc + monthlyPaise(toPaise(Number(item.amount) || 0), String(item.cadence ?? "Monthly")),
      0,
    );

  const topCategories = [...spent.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_CATEGORIES)
    .map(([category, paise]) => ({ category, spent: fromPaise(paise) }));

  return {
    month,
    income: fromPaise(totals.incomePaise),
    spent: fromPaise(totals.expensePaise),
    net: fromPaise(totals.incomePaise - totals.expensePaise),
    budget: {
      total: budgets.size > 0 ? fromPaise(budgetedPaise) : null,
      spentInBudgeted: fromPaise(spentInBudgetedPaise),
      percentUsed: percentUsed(spentInBudgetedPaise, budgets.size > 0 ? budgetedPaise : null),
      overCategories: lines.filter((line) => line.over).length,
    },
    topCategories,
    savings: {
      saved: fromPaise(savings.savedPaise),
      target: fromPaise(savings.targetPaise),
      percent: percentUsed(savings.savedPaise, savings.targetPaise),
      goals: savings.goals,
    },
    recurringMonthly: fromPaise(recurringMonthlyPaise),
    categories: lines,
  };
}
