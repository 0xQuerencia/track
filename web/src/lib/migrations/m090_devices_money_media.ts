import type { Migration } from "./types";

// Owned by feature agent: devices-money-media. Add ALTER/CREATE here, additive only.
export const migration: Migration = {
  version: 90,
  name: "devices_money_media",
  up() {
    // No schema yet.
  },
};
