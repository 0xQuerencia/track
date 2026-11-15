import "@/styles/plans.css";
import { Page } from "@/components/track/page";
import { todayStr } from "@/lib/dates";
import { PLANS_TAB_LABELS } from "@/lib/plans/constants";
import { resolvePlansView } from "@/lib/plans/view";
import { GoalsTab } from "./_components/goals-tab";
import { HabitsTab } from "./_components/habits-tab";
import { PlansTabs } from "./_components/tabs-nav";
import { RoutinesTab } from "./_components/routines-tab";
import { TasksTab } from "./_components/tasks-tab";
import { TodayTab } from "./_components/today-tab";
import { WeekTab } from "./_components/week-tab";

export const dynamic = "force-dynamic";

type Params = { tab?: string | string[]; new?: string | string[]; week?: string | string[] };

export default async function PlansPage({ searchParams }: { searchParams: Promise<Params> }) {
  const view = resolvePlansView(await searchParams, todayStr());

  return (
    <Page
      kicker="Plans"
      title="Plans & Goals"
      lede="Today's work, the task board, goals that roll up from real progress, habits, routines and the week ahead."
    >
      <PlansTabs active={view.tab} />
      <section aria-label={PLANS_TAB_LABELS[view.tab]} className="pl-section">
        {view.tab === "today" ? <TodayTab /> : null}
        {view.tab === "tasks" ? <TasksTab openForm={view.openTaskForm} /> : null}
        {view.tab === "goals" ? <GoalsTab /> : null}
        {view.tab === "habits" ? <HabitsTab /> : null}
        {view.tab === "routines" ? <RoutinesTab /> : null}
        {view.tab === "week" ? <WeekTab weekStart={view.weekStart} /> : null}
      </section>
    </Page>
  );
}
