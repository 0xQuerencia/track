import "@/styles/health.css";
import { Page } from "@/components/track/page";
import { HEALTH_DISCLAIMER, HEALTH_TAB_LABELS } from "@/lib/health/constants";
import { resolveHealthTab } from "@/lib/health/view";
import { ExerciseTab } from "./_components/exercise-tab";
import { GoalsTab } from "./_components/goals-tab";
import { HealthTabs } from "./_components/health-tabs";
import { HydrationTab } from "./_components/hydration-tab";
import { NutritionTab } from "./_components/nutrition-tab";
import { OverviewTab } from "./_components/overview-tab";
import { SleepTab } from "./_components/sleep-tab";

export const dynamic = "force-dynamic";

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const tab = resolveHealthTab((await searchParams).tab);
  return (
    <Page
      kicker="Health"
      title="Health"
      lede="Sleep, energy, training, water and goals. A quick daily log is enough."
    >
      <HealthTabs active={tab} />
      <section aria-label={HEALTH_TAB_LABELS[tab]} className="hl-section">
        {tab === "overview" ? <OverviewTab /> : null}
        {tab === "sleep" ? <SleepTab /> : null}
        {tab === "exercise" ? <ExerciseTab /> : null}
        {tab === "hydration" ? <HydrationTab /> : null}
        {tab === "nutrition" ? <NutritionTab /> : null}
        {tab === "goals" ? <GoalsTab /> : null}
      </section>
      <p className="hl-disclaimer">{HEALTH_DISCLAIMER}</p>
    </Page>
  );
}
