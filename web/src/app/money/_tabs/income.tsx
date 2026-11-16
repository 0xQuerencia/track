import { EntityPanel } from "@/components/track/entity-panel";
import { StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { listRows } from "@/lib/crud";
import { fromPaise, toPaise } from "@/lib/money/format";
import { monthTotalsPaise } from "@/lib/money/queries";

/** Expected income from the sources you list, against what was recorded this month. */
export function IncomeTab({ month }: { month: string }) {
  const sources = listRows("income_sources");
  const expectedPaise = sources
    .filter((source) => Number(source.active) === 1)
    .reduce((acc, source) => acc + toPaise(Number(source.expected_monthly) || 0), 0);
  const recordedPaise = monthTotalsPaise(month).incomePaise;
  const differencePaise = recordedPaise - expectedPaise;

  return (
    <>
      <StatGrid>
        <StatCard label="Expected per month" value={fromPaise(expectedPaise)} currency hint="Active sources" />
        <StatCard label="Recorded this month" value={fromPaise(recordedPaise)} currency hint={`From transactions, ${month}`} />
        <StatCard
          label="Difference"
          value={fromPaise(differencePaise)}
          currency
          tone={differencePaise < 0 ? "negative" : differencePaise > 0 ? "positive" : undefined}
        />
      </StatGrid>
      <EntityPanel
        entityKey="income_sources"
        title="Income sources"
        description="Where your income comes from and what you expect each month. Record the actual money as Income transactions."
        rows={sources}
        columns={[
          { name: "name" },
          { name: "kind" },
          { name: "expected_monthly", label: "Expected per month" },
          { name: "active", inline: true },
        ]}
      />
    </>
  );
}
