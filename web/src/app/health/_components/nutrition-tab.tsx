import { EntityPanel } from "@/components/track/entity-panel";
import { Panel } from "@/components/track/page";
import { listRows } from "@/lib/crud";

/** Notes on meals. No calorie, macro or nutrient figures are calculated or suggested. */
export function NutritionTab() {
  return (
    <>
      <Panel title="Meal notes" description="Free-form notes on what you ate and how it felt. This tab does not count calories or nutrients.">
        <p className="hl-muted">Write what is useful to you; nothing here is scored.</p>
      </Panel>
      <EntityPanel
        entityKey="nutrition_notes"
        title="Meals"
        description="One note per meal."
        rows={listRows("nutrition_notes")}
        columns={[{ name: "date" }, { name: "meal" }, { name: "notes" }]}
      />
    </>
  );
}
