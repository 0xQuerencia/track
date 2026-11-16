import "@/styles/money.css";
import { Page } from "@/components/track/page";
import { monthStart, todayStr } from "@/lib/dates";
import { isMonth, monthOf } from "@/lib/money/format";
import { BudgetsTab } from "./_tabs/budgets";
import { ExportTab } from "./_tabs/export";
import { GoalsTab } from "./_tabs/goals";
import { IncomeTab } from "./_tabs/income";
import { OverviewTab } from "./_tabs/overview";
import { RecurringTab } from "./_tabs/recurring";
import { TabNav, isMoneyTab, type MoneyTab } from "./_tabs/tab-nav";
import { TimelineTab } from "./_tabs/timeline";
import { TransactionsTab } from "./_tabs/transactions";

export const dynamic = "force-dynamic";

type Params = { tab?: string | string[]; month?: string | string[]; from?: string | string[]; to?: string | string[] };

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export default async function MoneyPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const requestedTab = first(params.tab);
  const tab: MoneyTab = isMoneyTab(requestedTab) ? requestedTab : "overview";
  const requestedMonth = first(params.month);
  const month = isMonth(requestedMonth) ? requestedMonth : monthOf(todayStr());

  return (
    <Page
      kicker="Money"
      title="Money"
      lede="Income, spending, budgets and savings goals, in rupees."
    >
      <TabNav current={tab} month={month} />
      {renderTab(tab, month, first(params.from), first(params.to))}
    </Page>
  );
}

function renderTab(tab: MoneyTab, month: string, from?: string, to?: string) {
  switch (tab) {
    case "overview":
      return <OverviewTab month={month} />;
    case "transactions":
      return <TransactionsTab />;
    case "budgets":
      return <BudgetsTab month={month} tab={tab} />;
    case "income":
      return <IncomeTab month={month} />;
    case "recurring":
      return <RecurringTab />;
    case "goals":
      return <GoalsTab />;
    case "timeline":
      return <TimelineTab month={month} tab={tab} />;
    case "export":
      return <ExportTab from={from ?? monthStart()} to={to} />;
  }
}
