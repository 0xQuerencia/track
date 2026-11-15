/*
 * Client-safe constants for the plans module: no database imports, so both
 * server code and components can use these lists directly.
 */

export const TASK_STATUSES = ["To do", "Doing", "Done"] as const;
export const TASK_PRIORITIES = ["High", "Medium", "Low"] as const;
export const TASK_AREAS = ["Study", "Life", "Project", "Health", "Money"] as const;
export const RECURRENCES = ["None", "Daily", "Weekly", "Weekdays", "Monthly"] as const;

export const GOAL_KINDS = ["Long-term", "Quarter", "Month", "Week", "Milestone"] as const;
export const GOAL_STATUSES = ["Active", "Paused", "Done", "Dropped"] as const;
export const REVIEW_CADENCES = ["None", "Weekly", "Monthly"] as const;
export const CONTRIBUTION_TYPES = [
  "task",
  "project",
  "chapter",
  "exam",
  "habit",
  "manual",
] as const;
export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

/** Levels in a goal tree, counting the root as level 1. */
export const MAX_GOAL_DEPTH = 4;
/** A chapter counts as mastered at this mastery %, the same bar Study HQ uses. */
export const MASTERY_TARGET = 80;

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const PLANS_TABS = ["today", "tasks", "goals", "habits", "routines", "week"] as const;
export type PlansTab = (typeof PLANS_TABS)[number];

export const PLANS_TAB_LABELS: Record<PlansTab, string> = {
  today: "Today",
  tasks: "Tasks",
  goals: "Goals",
  habits: "Habits",
  routines: "Routines",
  week: "Weekly plan",
};

export type RecurrenceRule = (typeof RECURRENCES)[number];
