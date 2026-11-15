import type { Migration } from "./types";

// Owned by feature agent: sessions-integrations. Add ALTER/CREATE here, additive only.
export const migration: Migration = {
  version: 50,
  name: "sessions_integrations",
  up() {
    // No schema yet.
  },
};
