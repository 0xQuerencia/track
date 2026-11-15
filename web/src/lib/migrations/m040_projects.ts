import type { Migration } from "./types";

// Owned by feature agent: projects. Add ALTER/CREATE here, additive only.
export const migration: Migration = {
  version: 40,
  name: "projects",
  up() {
    // No schema yet.
  },
};
