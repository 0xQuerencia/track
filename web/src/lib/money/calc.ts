import { CADENCES } from "../entities-ext/devices-money-media";

/*
 * Pure money rules: recurring schedules, monthly equivalents and budget
 * lines. Everything here takes integer paise or ISO dates and is deterministic.
 */

export type Cadence = (typeof CADENCES)[number];

const isCadence = (value: string): value is Cadence =>
  (CADENCES as readonly string[]).includes(value);

/** Adds whole months to an ISO date, clamping to the end of a shorter month (Jan 31 + 1 = Feb 28). */
function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const targetStart = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(targetStart.getUTCFullYear(), targetStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  targetStart.setUTCDate(Math.min(day, lastDay));
  return targetStart.toISOString().slice(0, 10);
}

/** The next due date after `date` for a cadence. Unknown cadences are an error, not a guess. */
export function advanceDue(date: string, cadence: string): string {
  if (!isCadence(cadence)) throw new RangeError(`Unknown cadence: ${cadence}`);
  switch (cadence) {
    case "Weekly": {
      const next = new Date(`${date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 7);
      return next.toISOString().slice(0, 10);
    }
    case "Monthly":
      return addMonths(date, 1);
    case "Quarterly":
      return addMonths(date, 3);
    case "Yearly":
      return addMonths(date, 12);
  }
}

/**
 * An amount's monthly equivalent in integer paise: weekly is 52 weeks over
 * 12 months, quarterly is a third, yearly a twelfth. Rounded to the paisa.
 */
export function monthlyPaise(amountPaise: number, cadence: string): number {
  if (!isCadence(cadence)) throw new RangeError(`Unknown cadence: ${cadence}`);
  switch (cadence) {
    case "Weekly":
      return Math.round((amountPaise * 52) / 12);
    case "Monthly":
      return amountPaise;
    case "Quarterly":
      return Math.round(amountPaise / 3);
    case "Yearly":
      return Math.round(amountPaise / 12);
  }
}

export type BudgetLine = {
  category: string;
  /** Null when the category has spending but no budget set. */
  budgetPaise: number | null;
  spentPaise: number;
  /** Negative when over budget. Null without a budget. */
  remainingPaise: number | null;
  over: boolean;
  /** Whole percent used, or null without a budget. */
  percent: number | null;
};

/** Whole percent of `budget` that `spent` uses. Null when there is no budget to measure against. */
export function percentUsed(spentPaise: number, budgetPaise: number | null): number | null {
  if (budgetPaise === null || budgetPaise <= 0) return null;
  return Math.round((spentPaise / budgetPaise) * 100);
}

/**
 * One line per category that has a budget or spending this month. Order
 * follows `categoryOrder` first, then any others alphabetically.
 */
export function budgetLines(
  budgets: ReadonlyMap<string, number>,
  spent: ReadonlyMap<string, number>,
  categoryOrder: readonly string[],
): BudgetLine[] {
  const names = new Set<string>([...budgets.keys(), ...spent.keys()]);
  const ordered = [
    ...categoryOrder.filter((name) => names.has(name)),
    ...[...names].filter((name) => !categoryOrder.includes(name)).sort(),
  ];
  return ordered.map((category) => {
    const budget = budgets.get(category) ?? null;
    const spentPaise = spent.get(category) ?? 0;
    return {
      category,
      budgetPaise: budget,
      spentPaise,
      remainingPaise: budget === null ? null : budget - spentPaise,
      over: budget !== null && spentPaise > budget,
      percent: percentUsed(spentPaise, budget),
    };
  });
}
