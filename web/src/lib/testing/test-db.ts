import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../db";

/*
 * Test-only helpers. A test calls installTestDb() in beforeEach, which opens
 * a fresh temp database and makes it the connection that getDb() returns, so
 * tests never touch data/track.db.
 */

let tempDir: string | null = null;

export function makeTempDir(prefix = "track-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function installTestDb(): DatabaseSync {
  closeTestDb();
  tempDir = makeTempDir();
  const db = openDatabase(path.join(tempDir, "test.db"));
  globalThis.__trackDb = db;
  return db;
}

export function closeTestDb(): void {
  const db = globalThis.__trackDb;
  if (db) db.close();
  globalThis.__trackDb = undefined;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
}
