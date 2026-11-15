import { EntityPanel } from "@/components/track/entity-panel";
import { listRows } from "@/lib/crud";
import { projectChoices } from "@/lib/money/queries";
import { ProjectPicker } from "../_components/project-picker";

/** Every income and expense, with the project each one is earned for. */
export function TransactionsTab() {
  const projects = projectChoices();
  return (
    <EntityPanel
      entityKey="transactions"
      title="Transactions"
      description="Income and expenses. Set a project on an income row to record what a project earned."
      rows={listRows("transactions")}
      formExclude={["project_id"]}
      columns={[
        { name: "date" },
        { name: "kind" },
        { name: "amount" },
        { name: "category" },
        { name: "note" },
        {
          name: "project_id",
          label: "Project",
          render: (row) => (
            <ProjectPicker
              transactionId={row.id}
              projectId={row.project_id === null || row.project_id === "" ? null : Number(row.project_id)}
              projects={projects}
            />
          ),
        },
      ]}
    />
  );
}
