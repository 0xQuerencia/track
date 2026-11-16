import { BarsChart, Donut, PALETTE } from "@/components/track/charts";
import { Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { getMoneySnapshot } from "@/lib/money";
import { formatMoney } from "@/lib/money/format";
import { expensesByCategory, incomeVersusExpense } from "@/lib/queries";

/** The selected month at a glance: totals, budget use, savings and the usual charts. */
export function OverviewTab({ month }: { month: string }) {
  const snapshot = getMoneySnapshot(month);
  const net = snapshot.net;
  return (
    <>
      <StatGrid>
        <StatCard label="Income" value={snapshot.income} currency />
        <StatCard label="Spent" value={snapshot.spent} currency />
        <StatCard
          label="Net"
          value={net}
          currency
          tone={net < 0 ? "negative" : net > 0 ? "positive" : undefined}
        />
        <StatCard
          label="Saved toward goals"
          value={snapshot.savings.saved}
          currency
          hint={snapshot.savings.target > 0 ? `of ${formatMoney(snapshot.savings.target)}` : undefined}
        />
      </StatGrid>
      <StatGrid>
        <StatCard
          label="Budget used"
          value={snapshot.budget.percentUsed}
          suffix="%"
          hint={snapshot.budget.total === null ? "No budgets set" : `of ${formatMoney(snapshot.budget.total)}`}
        />
        <StatCard label="Categories over budget" value={snapshot.budget.overCategories} />
        <StatCard label="Recurring, per month" value={snapshot.recurringMonthly} currency hint="Active items" />
      </StatGrid>
      <SplitPanels>
        <Panel title="Income vs spending, 6 months">
          <BarsChart
            data={incomeVersusExpense(6)}
            series={[
              { key: "income", color: PALETTE[0] },
              { key: "expense", color: PALETTE[5] },
            ]}
            emptyNote="Add transactions to see the comparison."
          />
        </Panel>
        <Panel title="Spending by category">
          <Donut data={expensesByCategory(month)} centerLabel="INR" emptyNote="No spending recorded this month." />
        </Panel>
      </SplitPanels>
      <Panel title="Top categories" description="Where the money went this month.">
        {snapshot.topCategories.length === 0 ? (
          <p className="tk-empty">No spending recorded this month.</p>
        ) : (
          <ol className="tk-list money-top-categories">
            {snapshot.topCategories.map((item) => (
              <li key={item.category}>
                <span>{item.category}</span>
                <small>{formatMoney(item.spent)}</small>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </>
  );
}
