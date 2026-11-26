import type { Migration } from "./types";

export const migration: Migration = {
  version: 200,
  name: "dreamer_ci_specialist",
  up(db) {
    db.exec(`
      ALTER TABLE dreamer_jobs ADD COLUMN ci_repository TEXT;
      ALTER TABLE dreamer_jobs ADD COLUMN ci_permission_sha256 TEXT;
    `);
  },
};
