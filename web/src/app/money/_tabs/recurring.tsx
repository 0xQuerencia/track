import { EntityPanel } from "@/components/track/entity-panel";
import { Panel, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { addDays, shortDay, todayStr } from "@/lib/dates";
import { monthlyPaise } from "@/lib/money/calc";
import { formatMoney, fromPaise, toPaise } from "@/lib/money/format";
import { recurringItems } from "@/lib/money/queries";
import { MarkPaidButton } from "../_components/mark-paid-button";

const UPCOMING_DAYS = 30;

/** Recurring bills and subscriptions: monthly equivalents, what is due, and marking payments. */
export function RecurringTab() {
  const today = todayStr();
  const horizon = addDays(today, UPCOMING_DAYS);
  const items = recurringItems();
  const active = items.filter((item) => Number(item.active) === 1);

  const monthlyOf = (item: (typeof items)[number]) =>
    monthlyPaise(toPaise(Number(item.amount) || 0), String(item.cadence ?? "Monthly"));
  const monthlyTotal = active.reduce((acc, item) => acc + monthlyOf(item), 0);
  const subscriptionTotal = active
    .filter((item) => Number(item.is_subscription) === 1)
    .reduce((acc, item) => acc + monthlyOf(item), 0);
  const dated = active.filter((item) => typeof item.next_due === "string" && item.next_due !== "");
  const overdue = dated.filter((item) => String(item.next_due) < today);
  const upcoming = dated
    .filter((item) => String(item.next_due) <= horizon)
    .sort((a, b) => String(a.next_due).localeCompare(String(b.next_due)));

  return (
    <>
      <StatGrid>
        <StatCard label="Recurring, per month" value={fromPaise(monthlyTotal)} currency hint={`${active.length} active`} />
        <StatCard label="Subscriptions, per month" value={fromPaise(subscriptionTotal)} currency />
        <StatCard label={`Due in ${UPCOMING_DAYS} days`} value={upcoming.length} />
        <StatCard label="Overdue" value={overdue.length} tone={overdue.length > 0 ? "negative" : undefined} />
      </StatGrid>
      <Panel title="Next due" description={`Active items due in the next ${UPCOMING_DAYS} days, and anything overdue.`}>
        {upcoming.length === 0 ? (
          <p className="tk-empty">Nothing due in the next {UPCOMING_DAYS} days.</p>
        ) : (
          <ul className="tk-list money-upcoming">
            {upcoming.map((item) => {
              const due = String(item.next_due);
              return (
                <li key={item.id}>
                  <span>{String(item.name)}</span>
                  <small>
                    {formatMoney(Number(item.amount) || 0)} · {due < today ? "overdue, " : ""}
                    {due === today ? "due today" : `due ${shortDay(due)}`}
                  </small>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <EntityPanel
        entityKey="recurring_expenses"
        title="Recurring & subscriptions"
        description="Each item shows its monthly equivalent. Mark paid records one transaction for its due date and moves it to the next one."
        rows={items}
        columns={[
          { name: "name" },
          { name: "category" },
          { name: "amount" },
          { name: "cadence", inline: true },
          { name: "next_due", label: "Next due" },
          { name: "active", inline: true },
          { name: "is_subscription", label: "Subscription", inline: true },
          {
            name: "monthly",
            label: "Per month",
            render: (row) => formatMoney(monthlyOf(row), { paise: true }),
          },
          {
            name: "pay",
            label: "Payment",
            render: (row) =>
              typeof row.next_due === "string" && row.next_due !== "" ? (
                <MarkPaidButton
                  recurringId={row.id}
                  dueDate={row.next_due}
                  disabled={Number(row.active) !== 1}
                />
              ) : (
                "No due date"
              ),
          },
        ]}
      />
    </>
  );
}
