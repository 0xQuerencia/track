import type { Migration } from "./types";

// Owned by feature agent: timeline-reviews. Add ALTER/CREATE here, additive only.
export const migration: Migration = {
  version: 100,
  name: "timeline_reviews",
  up() {
    // No schema yet.
  },
};
