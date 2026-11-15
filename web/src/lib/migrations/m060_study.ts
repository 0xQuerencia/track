import type { Migration } from "./types";

// Owned by feature agent: study. Add ALTER/CREATE here, additive only.
export const migration: Migration = {
  version: 60,
  name: "study",
  up() {
    // No schema yet.
  },
};
