/*
 * Option lists for study records. This module imports nothing, so
 * entities-ext can use it without a cycle through entities.ts.
 * STUDY_SUBJECTS must match SUBJECTS in entities.ts (a test checks this).
 */
export const STUDY_SUBJECTS = [
  "Physics",
  "Chemistry",
  "Mathematics",
  "English",
  "Gujarati",
  "Physical Education",
] as const;

export const TRACKS = ["Boards", "JEE", "Both"] as const;
export const PRIORITIES = ["High", "Medium", "Low"] as const;
export const MOCK_KINDS = [
  "Boards",
  "JEE Main",
  "JEE Advanced",
  "Chapter test",
  "Other",
] as const;
export const ASSIGNMENT_STATUSES = ["Todo", "Doing", "Done"] as const;
export const RESOURCE_KINDS = ["Book", "Video", "Notes", "Site", "Other"] as const;
export const OVERRIDE_ACTIONS = ["pin", "snooze", "skip"] as const;
export type OverrideAction = (typeof OVERRIDE_ACTIONS)[number];
