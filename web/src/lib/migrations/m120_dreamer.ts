import type { Migration } from "./types";

// Owned by the Dreamer agent (dreamer_* tables). Additive only.
export const migration: Migration = {
  version: 120,
  name: "dreamer",
  up() {
    // Filled in by the Dreamer agent.
  },
};
