import Link from "next/link";
import { monthLabel } from "@/lib/money/format";

export const MONEY_TABS = [
  { id: "overview", label: "Overview" },
  { id: "transactions", label: "Transactions" },
  { id: "budgets", label: "Budgets" },
  { id: "income", label: "Income" },
  { id: "recurring", label: "Recurring & subscriptions" },
  { id: "goals", label: "Goals" },
  { id: "timeline", label: "Timeline" },
  { id: "export", label: "Export" },
] as const;

export type MoneyTab = (typeof MONEY_TABS)[number]["id"];

export function isMoneyTab(value: string | undefined): value is MoneyTab {
  return MONEY_TABS.some((tab) => tab.id === value);
}

/** Tab links keep the chosen month, so switching tabs does not lose the period. */
export function TabNav({ current, month }: { current: MoneyTab; month: string }) {
  return (
    <nav className="tk-chips money-tabs" aria-label="Money sections">
      {MONEY_TABS.map((tab) => (
        <Link
          key={tab.id}
          href={`/money?tab=${tab.id}&month=${month}`}
          className="tk-chip"
          aria-current={current === tab.id ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/** Previous and next month links for tabs that work on one month. */
export function MonthNav({ tab, month, previous, next }: { tab: MoneyTab; month: string; previous: string; next: string }) {
  return (
    <nav className="money-month-nav" aria-label="Choose month">
      <Link href={`/money?tab=${tab}&month=${previous}`} className="tk-button tk-ghost">
        ← Previous
      </Link>
      <strong aria-current="date">{monthLabel(month)}</strong>
      <Link href={`/money?tab=${tab}&month=${next}`} className="tk-button tk-ghost">
        Next →
      </Link>
    </nav>
  );
}
