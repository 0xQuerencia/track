import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

export const BACKUPS_TO_KEEP = 5;

const backupPrefix = (file: string) => `${path.basename(file)}.bak-`;

/**
 * Writes a consistent copy of the open database next to `file` as
 * `<file>.bak-<timestamp>` (VACUUM INTO reads through the WAL, so the copy
 * includes uncheckpointed writes). Older backups beyond `keep` are removed.
 */
export function backupDatabase(
  db: DatabaseSync,
  file: string,
  keep: number = BACKUPS_TO_KEEP,
): string {
  const dir = path.dirname(file);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let target = path.join(dir, `${backupPrefix(file)}${stamp}`);
  for (let n = 1; fs.existsSync(target); n++) {
    target = path.join(dir, `${backupPrefix(file)}${stamp}-${n}`);
  }
  db.prepare("VACUUM INTO ?").run(target);
  pruneBackups(file, keep);
  return target;
}

/** Deletes all but the newest `keep` backups of `file`. Returns removed paths. */
export function pruneBackups(file: string, keep: number = BACKUPS_TO_KEEP): string[] {
  const dir = path.dirname(file);
  const prefix = backupPrefix(file);
  // Timestamps are fixed-width ISO strings, so name order is time order.
  const backups = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(prefix))
    .sort();
  const stale = backups.slice(0, Math.max(0, backups.length - keep));
  for (const name of stale) fs.rmSync(path.join(dir, name), { force: true });
  return stale.map((name) => path.join(dir, name));
}
