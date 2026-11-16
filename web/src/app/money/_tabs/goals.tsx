import { EntityPanel } from "@/components/track/entity-panel";
import { listRows } from "@/lib/crud";

/** Savings goals: how much is saved toward each target. */
export function GoalsTab() {
  return (
    <EntityPanel
      entityKey="savings_goals"
      title="Savings goals"
      rows={listRows("savings_goals")}
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
  );
}
