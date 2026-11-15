import { SESSION_STATUSES, SESSION_TOOLS, type SessionStatus, type SessionTool } from "./constants";

/*
 * Explorer filters, read from URL search params. Every value is checked
 * against a fixed list, so nothing from the URL reaches SQL unchecked. Text
 * search is escaped for LIKE.
 */

export const SORT_KEYS = ["recent", "oldest", "title", "tool"] as const;
export type SessionSort = (typeof SORT_KEYS)[number];

export const GROUP_KEYS = ["none", "project", "tool"] as const;
export type SessionGroup = (typeof GROUP_KEYS)[number];

export const VIEW_KEYS = ["list", "chronological"] as const;
export type SessionView = (typeof VIEW_KEYS)[number];

export const MAX_SEARCH_LENGTH = 80;

export type SessionFilters = {
  tool: SessionTool | null;
  status: SessionStatus | null;
  /** "yes" = linked to a project, "no" = not linked. */
  linked: "yes" | "no" | null;
  /** A project id, or "none" for sessions with no project. */
  project: number | "none" | null;
  q: string;
  sort: SessionSort;
  group: SessionGroup;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

function pick<T extends string>(value: string, allowed: readonly T[]): T | null {
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Escapes LIKE wildcards and the escape character itself. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function parseSessionFilters(params: Params): SessionFilters {
  const project = first(params.project);
  const projectValue =
    project === "none" ? "none" : /^\d{1,12}$/.test(project) ? Number(project) : null;
  const linkedRaw = first(params.linked);
  const pageRaw = Number(first(params.page));
  return {
    tool: pick(first(params.tool), SESSION_TOOLS),
    status: pick(first(params.status), SESSION_STATUSES),
    linked: linkedRaw === "yes" || linkedRaw === "no" ? linkedRaw : null,
    project: projectValue,
    q: first(params.q).slice(0, MAX_SEARCH_LENGTH),
    sort: pick(first(params.sort), SORT_KEYS) ?? "recent",
    group: pick(first(params.group), GROUP_KEYS) ?? "none",
    page: Number.isInteger(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 100_000) : 1,
  };
}

/** Builds a query string for links, keeping only non-default values. */
export function filtersToQuery(
  filters: Partial<SessionFilters>,
): string {
  const search = new URLSearchParams();
  if (filters.tool) search.set("tool", filters.tool);
  if (filters.status) search.set("status", filters.status);
  if (filters.linked) search.set("linked", filters.linked);
  if (filters.project !== undefined && filters.project !== null)
    search.set("project", String(filters.project));
  if (filters.q) search.set("q", filters.q);
  if (filters.sort && filters.sort !== "recent") search.set("sort", filters.sort);
  if (filters.group && filters.group !== "none") search.set("group", filters.group);
  if (filters.page && filters.page > 1) search.set("page", String(filters.page));
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const SORT_SQL: Record<SessionSort, string> = {
  recent: "s.last_activity_at IS NULL, s.last_activity_at DESC, s.id DESC",
  oldest: "s.last_activity_at IS NULL, s.last_activity_at ASC, s.id ASC",
  title: "LOWER(COALESCE(s.title, s.external_id)) ASC, s.id ASC",
  tool: "s.tool ASC, s.last_activity_at IS NULL, s.last_activity_at DESC, s.id DESC",
};
