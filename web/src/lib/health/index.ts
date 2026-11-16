/*
 * Health module entry point. Import from here; the parts live in this folder.
 * Health data is personal: nothing in this module writes it to logs.
 */
export { getHealthSnapshot, type HealthSnapshot } from "./aggregates";
export { dailySeries, monthlySeries, workoutsByWeek, hydrationByDay } from "./trends";
export { listFitnessGoals, measureMetric, fitnessProgress, type FitnessGoalView } from "./fitness";
export { HEALTH_DISCLAIMER, HEALTH_TABS, HEALTH_TAB_LABELS, type HealthTab } from "./constants";
