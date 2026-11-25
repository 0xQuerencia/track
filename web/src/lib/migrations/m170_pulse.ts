import type { Migration } from "./types";
export const migration: Migration = {
  version: 170, name: "pulse_intervals",
  up(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS pulse_intervals (
      token_id INTEGER NOT NULL REFERENCES integration_tokens(id),
      event_id TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('browser','desktop','android','editor','manual')),
      start_ms INTEGER NOT NULL CHECK(start_ms >= 0),
      end_ms INTEGER NOT NULL CHECK(end_ms > start_ms AND end_ms - start_ms <= 86400000),
      received_ms INTEGER NOT NULL,
      PRIMARY KEY(token_id,event_id)
    );
    CREATE INDEX IF NOT EXISTS pulse_time ON pulse_intervals(end_ms,start_ms);
    `);
  },
};
