import type { Migration } from "./types";

// Owned by feature agent: calendar. Add ALTER/CREATE here, additive only.
export const migration: Migration = {
  version: 30,
  name: "calendar",
  up() {
    // No schema yet.
  },
};
