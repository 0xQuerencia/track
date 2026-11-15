import { OPPORTUNITY_KINDS, OPPORTUNITY_STATUSES } from "./constants";
import { isDeadlineWindow, type DeadlineWindow } from "./deadlines";
import type { OpportunityFilters } from "./queries";

/*
 * Turns URL search parameters into validated filter values. Anything not on
 * the allowlists falls back to the default, so a crafted URL cannot reach SQL
 * or produce an odd page.
 */

export type CareerView = "list" | "board";

export type CareerParams = {
  view: CareerView;
  filters: OpportunityFilters;
  page: number;
};

type Raw = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? "";

function oneOf<T extends string>(value: string, options: readonly T[]): T | null {
  return (options as readonly string[]).includes(value) ? (value as T) : null;
}

export function parseCareerParams(raw: Raw): CareerParams {
  const view: CareerView = first(raw.view) === "board" ? "board" : "list";
  const windowValue = first(raw.window);
  const window: DeadlineWindow = isDeadlineWindow(windowValue) ? windowValue : "all";
  const pageNumber = Number.parseInt(first(raw.page), 10);
  return {
    view,
    filters: {
      kind: oneOf(first(raw.kind), OPPORTUNITY_KINDS),
      status: oneOf(first(raw.status), OPPORTUNITY_STATUSES),
      window,
    },
    page: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1,
  };
}

/** Builds a URL for the career page that keeps the current filters. */
export function careerHref(
  params: CareerParams,
  overrides: Partial<{ view: CareerView; page: number; kind: string | null; status: string | null; window: DeadlineWindow }> = {},
): string {
  const query = new URLSearchParams();
  const view = overrides.view ?? params.view;
  const kind = overrides.kind !== undefined ? overrides.kind : params.filters.kind;
  const status = overrides.status !== undefined ? overrides.status : params.filters.status;
  const window = overrides.window ?? params.filters.window;
  if (view !== "list") query.set("view", view);
  if (kind) query.set("kind", kind);
  if (status) query.set("status", status);
  if (window !== "all") query.set("window", window);
  const page = overrides.page ?? params.page;
  if (page > 1) query.set("page", String(page));
  const text = query.toString();
  return text ? `/career?${text}` : "/career";
}
