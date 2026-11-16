/*
 * Client-safe constants for career, people and documents: no database or
 * Node imports, so client components can use them directly.
 */

export const OPPORTUNITY_KINDS = [
  "College application",
  "Scholarship",
  "Competition",
  "Hackathon",
  "Certification",
  "Internship",
  "Portfolio",
  "Achievement",
  "Other",
] as const;

export const OPPORTUNITY_STATUSES = [
  "Interested",
  "Preparing",
  "Applied",
  "Accepted",
  "Rejected",
  "Completed",
] as const;

export const OPPORTUNITY_PRIORITIES = ["High", "Medium", "Low"] as const;

/** Statuses after which no deadline needs tracking. */
export const TERMINAL_STATUSES: readonly string[] = [
  "Accepted",
  "Rejected",
  "Completed",
];

/** Statuses that mean "not applied yet", so a passed deadline is a miss. */
export const PRE_APPLY_STATUSES: readonly string[] = ["Interested", "Preparing"];

/** Kinds shown on the milestones panel. */
export const MILESTONE_KINDS: readonly string[] = ["Achievement", "Portfolio"];

export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];
