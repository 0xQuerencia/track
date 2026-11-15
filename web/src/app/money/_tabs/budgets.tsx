import { Panel } from "@/components/track/page";
import { DeleteButton } from "@/components/track/row-controls";
import { listRows } from "@/lib/crud";
import { budgetLines } from "@/lib/money/calc";
import { addMonthsToMonth, formatMoney } from "@/lib/money/format";
import { budgetsForMonth, spendByCategory, transactionCategories } from "@/lib/money/queries";
import { BudgetForm } from "../_components/budget-form";
import { MonthNav, type MoneyTab } from "./tab-nav";

/** Spent against budget for each category in the chosen month, from real transactions. */
export function BudgetsTab({ month, tab }: { month: string; tab: MoneyTab }) {
  const categories = transactionCategories();
  const spent = spendByCategory(month);
  const budgets = budgetsForMonth(month);
  const lines = budgetLines(budgets, spent, categories);
  const budgetIds = new Map(
    listRows("budgets", { filter: { month } }).map((row) => [String(row.category), row]),
  );
  const over = lines.filter((line) => line.over).length;

  return (
    <>
      <MonthNav
        tab={tab}
        month={month}
        previous={addMonthsToMonth(month, -1)}
        next={addMonthsToMonth(month, 1)}
      />
      <Panel
        title="Spent against budget"
        description="Budgets are set per category for this month. Over-budget categories are flagged."
      >
        {lines.length === 0 ? (
          <p className="tk-empty">No budgets or spending for this month yet. Set a budget below.</p>
        ) : (
          <>
            {over > 0 ? (
              <p className="money-over-note" role="status">
                {over} {over === 1 ? "category is" : "categories are"} over budget.
              </p>
            ) : null}
            <div className="tk-table-wrap">
              <table className="tk-table money-budget-table">
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col" data-align="end">Budget</th>
                    <th scope="col" data-align="end">Spent</th>
                    <th scope="col" data-align="end">Remaining</th>
                    <th scope="col">Used</th>
                    <th scope="col" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const row = budgetIds.get(line.category);
                    return (
                      <tr key={line.category} data-over={line.over || undefined}>
                        <th scope="row">{line.category}</th>
                        <td data-align="end">
                          {line.budgetPaise === null ? "No budget" : formatMoney(line.budgetPaise, { paise: true })}
                        </td>
                        <td data-align="end">{formatMoney(line.spentPaise, { paise: true })}</td>
                        <td data-align="end">
                          {line.remainingPaise === null ? (
                            "—"
                          ) : line.over ? (
                            <span className="money-negative">
                              Over by {formatMoney(-line.remainingPaise, { paise: true })}
                            </span>
                          ) : (
                            formatMoney(line.remainingPaise, { paise: true })
                          )}
                        </td>
                        <td>
                          {line.percent === null ? (
                            "—"
                          ) : (
                            <progress
                              max={100}
                              value={Math.min(100, line.percent)}
                              aria-label={`${line.category}: ${line.percent}% of budget used`}
                            >
                              {line.percent}%
                            </progress>
                          )}
                        </td>
                        <td data-align="end">
                          {row ? (
                            <DeleteButton entityKey="budgets" id={row.id} label={`budget for ${line.category}`} />
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
      <Panel title="Set a budget" description={`For ${month}. Saving again for the same category replaces the amount.`}>
        <details className="tk-add" open={budgets.size === 0}>
          <summary>Set or change a budget</summary>
          <BudgetForm month={month} categories={categories} />
        </details>
        <p className="money-hint">
          Spent this month so far: {formatMoney(sumPaise(spent), { paise: true })}.
        </p>
      </Panel>
    </>
  );
}

function sumPaise(values: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const value of values.values()) total += value;
  return total;
}
