import { PRIORITIES, STUDY_SUBJECTS, TRACKS } from "@/lib/study/options";
import { DEFAULT_STUDY_MINUTES, MAX_BUDGET_MINUTES } from "@/lib/study/constants";

/** Filters for the Chapters table. Each value is validated against its option list. */
export type ChapterFilters = {
  subject: string;
  track: string;
  priority: string;
  covered: "" | "yes" | "no";
};

export type StudySearch = Record<string, string | string[] | undefined>;

export function firstParam(search: StudySearch, key: string): string {
  const value = search[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

const oneOf = (value: string, options: readonly string[]): string =>
  options.includes(value) ? value : "";

export function chapterFilters(search: StudySearch): ChapterFilters {
  const covered = firstParam(search, "covered");
  return {
    subject: oneOf(firstParam(search, "subject"), STUDY_SUBJECTS),
    track: oneOf(firstParam(search, "track"), TRACKS),
    priority: oneOf(firstParam(search, "priority"), PRIORITIES),
    covered: covered === "yes" || covered === "no" ? covered : "",
  };
}

/** Minutes available for planning. Anything out of range falls back to the default. */
export function parseBudget(raw: string): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 15 && n <= MAX_BUDGET_MINUTES ? n : DEFAULT_STUDY_MINUTES;
}

/** Builds a Study HQ link that keeps the current tab, filters and budget. */
export function studyHref(
  parts: { tab?: string; chapter?: number | null; filters?: ChapterFilters; budget?: number; hash?: string },
): string {
  const query = new URLSearchParams();
  if (parts.tab) query.set("tab", parts.tab);
  if (parts.budget !== undefined) query.set("budget", String(parts.budget));
  if (parts.filters) {
    for (const [key, value] of Object.entries(parts.filters)) if (value) query.set(key, value);
  }
  if (parts.chapter) query.set("chapter", String(parts.chapter));
  const search = query.toString();
  return `/study${search ? `?${search}` : ""}${parts.hash ? `#${parts.hash}` : ""}`;
}
