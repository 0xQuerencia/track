import { IDEA_CATEGORIES, IDEA_STATUSES } from "../entities-ext/ideas-knowledge";
import { choice, flag, pageNumber, text, type RawParams } from "../knowledge/params";

export type IdeaStatus = (typeof IDEA_STATUSES)[number];
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];
export type ArchivedMode = "active" | "archived" | "all";
export const IDEA_VIEWS = ["cards", "list", "board"] as const;
export type IdeaView = (typeof IDEA_VIEWS)[number];

export type IdeaFilters = {
  q: string;
  status: IdeaStatus | null;
  category: IdeaCategory | null;
  tag: string | null;
  pinned: boolean;
  archived: ArchivedMode;
};

/** Reads the idea list's URL state. Unknown values are dropped, not passed on. */
export function parseIdeaParams(raw: RawParams): { filters: IdeaFilters; view: IdeaView; page: number } {
  const archived = choice(raw, "archived", ["active", "archived", "all"] as const) ?? "active";
  const tag = text(raw, "tag", 40);
  return {
    filters: {
      q: text(raw, "q", 80),
      status: choice(raw, "status", IDEA_STATUSES),
      category: choice(raw, "category", IDEA_CATEGORIES),
      tag: tag || null,
      pinned: flag(raw, "pinned"),
      archived,
    },
    view: choice(raw, "view", IDEA_VIEWS) ?? "cards",
    page: pageNumber(raw),
  };
}
