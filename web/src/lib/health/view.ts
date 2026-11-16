import { HEALTH_TABS, type HealthTab } from "./constants";

/** Resolves ?tab= for /health. Unknown or missing values show the overview. */
export function resolveHealthTab(value: string | string[] | undefined): HealthTab {
  const requested = Array.isArray(value) ? value[0] : value;
  return (HEALTH_TABS as readonly string[]).includes(requested ?? "")
    ? (requested as HealthTab)
    : "overview";
}
