import type { Migration } from "./types";

// Owned by feature agent: plans-goals-health. Add ALTER/CREATE here, additive only.
export const migration: Migration = {
  version: 70,
  name: "plans_goals_health",
  up() {
    // No schema yet.
  },
};
