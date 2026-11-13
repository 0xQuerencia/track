import { BarsChart, Donut, PALETTE } from "@/components/track/charts";
import { EntityPanel } from "@/components/track/entity-panel";
import { Page, Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { listRows } from "@/lib/crud";
import { expensesByCategory, incomeVersusExpense, moneyMonth } from "@/lib/queries";

export const dynamic = "force-dynamic";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default function MoneyPage() {
  const month = moneyMonth();
  const goals = listRows("savings_goals");
  const saved = goals.reduce((sum, g) => sum + Number(g.saved ?? 0), 0);
  const target = goals.reduce((sum, g) => sum + Number(g.target ?? 0), 0);

  return (
    <Page
      kicker="Money"
      title="Money"
      lede="Income, spending and savings goals, in rupees."
    >
      <StatGrid>
        <StatCard label="Income this month" value={month.income} currency />
        <StatCard label="Spent this month" value={month.expense} currency />
        <StatCard
          label="Net this month"
          value={month.net}
          currency
          tone={month.net < 0 ? "negative" : month.net > 0 ? "positive" : undefined}
        />
        <StatCard
          label="Saved toward goals"
          value={saved}
          currency
          hint={target > 0 ? `of ${inr.format(target)}` : undefined}
        />
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
        <Panel title="Spending by category, this month">
          <Donut data={expensesByCategory()} centerLabel="INR" emptyNote="No spending recorded this month." />
        </Panel>
      </SplitPanels>
      <EntityPanel
        entityKey="transactions"
        title="Transactions"
        rows={listRows("transactions")}
      />
      <EntityPanel
        entityKey="savings_goals"
        title="Savings goals"
        rows={goals}
        columns={[
          { name: "name" },
          { name: "target" },
          { name: "saved", inline: true },
          {
            name: "progress",
            label: "Progress",
            render: (row) => {
              const pct = Number(row.target) > 0
                ? Math.min(100, Math.round((Number(row.saved ?? 0) / Number(row.target)) * 100))
                : 0;
              return <progress max={100} value={pct} aria-label={`${pct}% saved`} title={`${pct}%`} />;
            },
          },
          { name: "deadline" },
        ]}
      />
    </Page>
  );
}
