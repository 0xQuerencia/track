import { isoDate } from "../dates";
import { PLANS_TABS, type PlansTab } from "./constants";
import { weekStartOf } from "./week";

/*
 * Resolves the query string of /plans. `?new=task` (used by the command
 * palette) opens the task form on the Tasks tab, whatever `tab` says.
 */

export type PlansView = {
  tab: PlansTab;
  openTaskForm: boolean;
  weekStart: string;
};

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export function resolvePlansView(
  params: { tab?: string | string[]; new?: string | string[]; week?: string | string[] },
  today: string,
): PlansView {
  const requested = first(params.tab);
  const newKind = first(params.new);
  const tab = (PLANS_TABS as readonly string[]).includes(requested ?? "")
    ? (requested as PlansTab)
    : "today";
  const week = first(params.week);
  const weekStart = week && isoDate(week) && weekStartOf(week) === week ? week : weekStartOf(today);
  if (newKind === "task") return { tab: "tasks", openTaskForm: true, weekStart };
  return { tab, openTaskForm: false, weekStart };
}
