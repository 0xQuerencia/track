import type { DatabaseSync } from "node:sqlite";

/**
 * One schema step. `version` is unique and ascending; `up` must be additive
 * (CREATE ... IF NOT EXISTS, or ALTER ... ADD COLUMN through the helpers) so
 * it can never destroy rows. The runner wraps `up` in a transaction.
 */
export type Migration = {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
};
