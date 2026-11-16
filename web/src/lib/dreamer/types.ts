export const DREAMER_SOURCES = ["journal", "note", "idea"] as const;
export type DreamerSource = (typeof DREAMER_SOURCES)[number];

export const INSIGHT_KINDS = [
  "interest",
  "problem",
  "project_idea",
  "learning_goal",
  "intention",
  "commitment",
  "observation",
  "recurring_theme",
  "unresolved_question",
  "improvement",
] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

export type SourceDocument = {
  source: DreamerSource;
  refId: string;
  title: string;
  category: string;
  tags: string[];
  date: string;
  content: string;
};

export type Evidence = {
  id: number;
  kind: string;
  source: DreamerSource;
  refId: string;
  quote: string;
  start: number;
  end: number;
  date: string;
};

export type RunSummary = {
  id: number;
  kind: "daily" | "weekly";
  periodKey: string;
  alreadyRan: boolean;
  processed: number;
  unchanged: number;
  newInsights: number;
  newSuggestions: number;
  aiNotice: string | null;
  brief: string;
};

export type DreamerFeedback =
  | "useful"
  | "save_later"
  | "explore"
  | "convert_to_project"
  | "already_implemented"
  | "not_relevant"
  | "dont_suggest_again";
