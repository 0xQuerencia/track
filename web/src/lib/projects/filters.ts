import { LIBRARY_VIEWS, PAGE_SIZE, PROJECT_STATUSES, SORT_KEYS, type LibraryView, type SortKey } from "./constants";

/*
 * Parses the library's URL search params. Every value is checked against a
 * whitelist or clamped, so nothing unexpected reaches the SQL.
 */

export type ArchivedMode = "hide" | "show" | "only";
export type RepoFilter = "any" | "yes" | "no";

export type LibraryQuery = {
  view: LibraryView;
  status: (typeof PROJECT_STATUSES)[number] | null;
  category: string | null;
  tag: string | null;
  tech: string | null;
  repo: RepoFilter;
  archived: ArchivedMode;
  q: string;
  sort: SortKey;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;

const MAX_TERM = 80;

function first(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

/** Strips control characters and caps length. Used for every free-text filter. */
export function cleanTerm(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TERM);
}

function pick<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function parseLibraryParams(params: Params): LibraryQuery {
  const status = first(params.status);
  const page = Math.max(1, Math.min(10_000, Math.trunc(Number(first(params.page))) || 1));
  const category = cleanTerm(first(params.category));
  const tag = cleanTerm(first(params.tag));
  const tech = cleanTerm(first(params.tech));
  return {
    view: pick(first(params.view), LIBRARY_VIEWS, "grid"),
    status: (PROJECT_STATUSES as readonly string[]).includes(status)
      ? (status as LibraryQuery["status"])
      : null,
    category: category || null,
    tag: tag || null,
    tech: tech || null,
    repo: pick(first(params.repo), ["any", "yes", "no"] as const, "any"),
    archived: pick(first(params.archived), ["hide", "show", "only"] as const, "hide"),
    q: cleanTerm(first(params.q)),
    sort: pick(first(params.sort), SORT_KEYS, "activity"),
    page,
  };
}

/** Builds a URL query string from a query, leaving out defaults. Used for links and the filter form. */
export function libraryQueryString(query: Partial<LibraryQuery>): string {
  const out = new URLSearchParams();
  const set = (key: string, value: string | number | null | undefined, skip?: string) => {
    if (value === null || value === undefined || value === "" || String(value) === skip) return;
    out.set(key, String(value));
  };
  set("view", query.view, "grid");
  set("status", query.status);
  set("category", query.category);
  set("tag", query.tag);
  set("tech", query.tech);
  set("repo", query.repo, "any");
  set("archived", query.archived, "hide");
  set("q", query.q);
  set("sort", query.sort, "activity");
  if (query.page && query.page > 1) set("page", query.page);
  const text = out.toString();
  return text ? `?${text}` : "";
}

export function pageCount(total: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
