/*
 * Client-safe vocabulary for the project hub: no database imports here, so
 * components and server code share one list of allowed values.
 */

export const PROJECT_STATUSES = ["Active", "Idea", "Paused", "Shipped"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TASK_STATUSES = ["Backlog", "Doing", "Done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_KINDS = ["Feature", "Bug", "Release", "Chore"] as const;
export const TASK_PRIORITIES = ["High", "Medium", "Low"] as const;

export const MILESTONE_STATUSES = ["Planned", "Doing", "Done"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const RESOURCE_KINDS = ["Doc", "Link", "Screenshot", "Asset", "Note"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const REPO_EVENT_KINDS = [
  "commit",
  "branch",
  "pr",
  "issue",
  "release",
  "worktree",
] as const;
export type RepoEventKind = (typeof REPO_EVENT_KINDS)[number];

export const HISTORY_KINDS = ["created", "status", "archived", "unarchived", "milestone"] as const;

export const LIBRARY_VIEWS = ["grid", "list", "table", "kanban"] as const;
export type LibraryView = (typeof LIBRARY_VIEWS)[number];

export const SORT_KEYS = ["name", "activity", "status", "open"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const TAB_IDS = [
  "overview",
  "tasks",
  "development",
  "sessions",
  "roadmap",
  "resources",
  "history",
] as const;
export type TabId = (typeof TAB_IDS)[number];

export const PAGE_SIZE = 24;
export const KANBAN_LIMIT = 24;
