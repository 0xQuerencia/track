/*
 * Client-safe health constants. Everything here is a label or a fixed list;
 * no personal values live in the repository.
 */

export const HEALTH_DISCLAIMER = "Personal tracking only, not medical advice.";

export const WORKOUT_KINDS = ["Strength", "Cardio", "Mobility", "Sport", "Walk", "Other"] as const;
export const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack", "Other"] as const;
export const FITNESS_METRICS = [
  "Workouts per week",
  "Sleep hours",
  "Water ml",
  "Steps",
  "Custom",
] as const;
export type FitnessMetric = (typeof FITNESS_METRICS)[number];

/** Metrics that have a real data source in this app. Others show their target only. */
export const MEASURABLE_METRICS: readonly FitnessMetric[] = [
  "Workouts per week",
  "Sleep hours",
  "Water ml",
];

export const HEALTH_TABS = [
  "overview",
  "sleep",
  "exercise",
  "hydration",
  "nutrition",
  "goals",
] as const;
export type HealthTab = (typeof HEALTH_TABS)[number];

export const HEALTH_TAB_LABELS: Record<HealthTab, string> = {
  overview: "Overview",
  sleep: "Sleep & Energy",
  exercise: "Exercise",
  hydration: "Hydration",
  nutrition: "Nutrition",
  goals: "Goals",
};
