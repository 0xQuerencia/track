import { addColumnIfMissing } from "./helpers";
import type { Migration } from "./types";

/*
 * Devices, money and media. Additive only: new tables are CREATE IF NOT
 * EXISTS, and new columns on legacy tables go through addColumnIfMissing so
 * existing rows are kept. Money amounts are REAL rupees (rounded to paise
 * when summed); see src/lib/money/format.ts.
 */
export const migration: Migration = {
  version: 90,
  name: "devices_money_media",
  up(db) {
    // ---- devices & services ----
    db.exec(`CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT,
      os TEXT,
      location TEXT,
      storage_total_gb REAL,
      storage_used_gb REAL,
      last_seen_at TEXT,
      connectivity TEXT NOT NULL DEFAULT 'Unknown',
      verified_at TEXT,
      verified_by TEXT,
      maintenance_notes TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT,
      url TEXT,
      device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'Unknown',
      status_source TEXT,
      last_checked_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS maintenance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      date TEXT,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS services_device ON services (device_id)`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS services_project ON services (project_id)`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS maintenance_logs_device ON maintenance_logs (device_id, date)`,
    );

    // ---- money ----
    db.exec(`CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS budgets_month_category ON budgets (month, category)`,
    );
    db.exec(`CREATE TABLE IF NOT EXISTS income_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT,
      expected_monthly REAL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS recurring_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      amount REAL NOT NULL,
      cadence TEXT NOT NULL DEFAULT 'Monthly',
      next_due TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      is_subscription INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    // One row per (recurring item, due date): the idempotency key for "mark paid".
    db.exec(`CREATE TABLE IF NOT EXISTS recurring_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recurring_id INTEGER NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE,
      due_date TEXT NOT NULL,
      transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (recurring_id, due_date)
    )`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS transactions_date ON transactions (date)`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS recurring_expenses_next_due ON recurring_expenses (active, next_due)`,
    );

    addColumnIfMissing(db, "transactions", "project_id", `"project_id" REAL`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS transactions_project ON transactions (project_id)`,
    );

    // ---- media ----
    addColumnIfMissing(db, "media_items", "progress_current", `"progress_current" REAL`);
    addColumnIfMissing(db, "media_items", "progress_total", `"progress_total" REAL`);
    addColumnIfMissing(db, "media_items", "started_on", `"started_on" TEXT`);
    addColumnIfMissing(db, "media_items", "finished_on", `"finished_on" TEXT`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS media_items_kind_status ON media_items (kind, status)`,
    );

    // ---- journal ----
    addColumnIfMissing(db, "journal_entries", "title", `"title" TEXT`);
    addColumnIfMissing(db, "journal_entries", "tags", `"tags" TEXT`);
    db.exec(
      `CREATE INDEX IF NOT EXISTS journal_entries_date ON journal_entries (date)`,
    );
  },
};
