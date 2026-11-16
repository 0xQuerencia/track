/*
 * Private file storage for the document vault.
 *
 * File bytes live outside the database and outside the public web root, in
 * TRACK_FILES_DIR, or by default in data/files under the working directory.
 * data/ is git-ignored, so the bytes never enter the repository. Each file is
 * named by a random UUID that the app generates. User input never becomes a
 * path. Files are created 0600 and are served only by the authenticated route
 * GET /api/documents/[id]/file.
 *
 * Path containment: every stored path is rebuilt from a UUID that passes a
 * strict pattern, then checked to resolve directly inside the files directory.
 *
 * Logging: errors here log an error code, never a file name or contents.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

type Env = Record<string, string | undefined>;

/** The directory holding stored bytes, resolved to an absolute path. */
export function filesDir(env: Env = process.env): string {
  const configured = env.TRACK_FILES_DIR?.trim();
  const dir = path.resolve(configured || path.join(process.cwd(), "data", "files"));
  // Misconfiguration fails loudly: bytes under public/ would be served without auth.
  const publicRoot = path.resolve(process.cwd(), "public");
  const inside = path.relative(publicRoot, dir);
  if (inside === "" || (!inside.startsWith("..") && !path.isAbsolute(inside)))
    throw new Error("TRACK_FILES_DIR must not point inside public/.");
  return dir;
}

export function isStorageKey(value: unknown): value is string {
  return typeof value === "string" && UUID_V4.test(value);
}

export function newStorageKey(): string {
  return randomUUID();
}

/**
 * The absolute path for a storage key, or null when the key is malformed or
 * would resolve outside the files directory.
 */
export function resolveStoredPath(key: unknown, dir: string = filesDir()): string | null {
  if (!isStorageKey(key)) return null;
  const root = path.resolve(dir);
  const candidate = path.resolve(root, key);
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  if (relative !== key) return null;
  return candidate;
}

/**
 * Writes bytes under a new key. The file is opened exclusively ('wx'), so an
 * existing file is never overwritten, and it is created 0600.
 */
export async function writeStoredFile(
  key: string,
  bytes: Uint8Array,
  dir: string = filesDir(),
): Promise<void> {
  const target = resolveStoredPath(key, dir);
  if (!target) throw new Error("Invalid storage key.");
  await fs.promises.mkdir(path.resolve(dir), { recursive: true, mode: DIR_MODE });
  const handle = await fs.promises.open(target, "wx", FILE_MODE);
  try {
    await handle.writeFile(bytes);
    await handle.chmod(FILE_MODE);
  } finally {
    await handle.close();
  }
}

/** The stored bytes, or null when the file is missing. */
export async function readStoredFile(
  key: unknown,
  dir: string = filesDir(),
): Promise<Buffer | null> {
  const target = resolveStoredPath(key, dir);
  if (!target) return null;
  try {
    return await fs.promises.readFile(target);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    console.error(`[documents] could not read a stored file (${errorCode(error)})`);
    return null;
  }
}

/**
 * Removes a stored file. Best effort, never throws. Returns true when the file
 * is gone afterwards (including when it was already missing), and false for an
 * invalid key or a removal error, which is logged by code only.
 */
export async function removeStoredFile(key: unknown, dir: string = filesDir()): Promise<boolean> {
  const target = resolveStoredPath(key, dir);
  if (!target) return false;
  try {
    await fs.promises.rm(target, { force: true });
    return true;
  } catch (error) {
    console.error(`[documents] could not remove a stored file (${errorCode(error)})`);
    return false;
  }
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) return String(error.code);
  return "unknown";
}
