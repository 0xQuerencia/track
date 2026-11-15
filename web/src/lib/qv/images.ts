import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db";
import { MAX_IMAGE_BYTES } from "./constants";

/** Screenshot storage. Bytes live in the database so backups and restores keep them with their questions. */

const SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/png", test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", test: (b) => b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { mime: "image/gif", test: (b) => b.length > 6 && ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("latin1")) },
];

/** Type comes from the file's own bytes, never from the name or the browser's claim. */
export function sniffImage(buffer: Buffer): string | null {
  return SIGNATURES.find((s) => s.test(buffer))?.mime ?? null;
}

export type StoredImage = { imageId: number; sha256: string; mime: string; duplicateOf: number | null };

export function storeImage(buffer: Buffer, db: DatabaseSync = getDb()): { ok: true; image: StoredImage } | { ok: false; error: string } {
  if (buffer.length === 0) return { ok: false, error: "The file is empty." };
  if (buffer.length > MAX_IMAGE_BYTES) return { ok: false, error: `Images are limited to ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` };
  const mime = sniffImage(buffer);
  if (!mime) return { ok: false, error: "Only PNG, JPEG, WebP or GIF images are accepted." };
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const existing = db.prepare("SELECT id, question_id FROM qv_images WHERE sha256 = ? ORDER BY question_id IS NULL, id LIMIT 1").get(sha256) as { id: number; question_id: number | null } | undefined;
  if (existing) return { ok: true, image: { imageId: existing.id, sha256, mime, duplicateOf: existing.question_id } };
  const info = db.prepare("INSERT INTO qv_images (sha256, mime, bytes, data) VALUES (?, ?, ?, ?)").run(sha256, mime, buffer.length, buffer);
  return { ok: true, image: { imageId: Number(info.lastInsertRowid), sha256, mime, duplicateOf: null } };
}

export function loadImage(id: number, db: DatabaseSync = getDb()): { mime: string; data: Buffer } | null {
  const row = db.prepare("SELECT mime, data FROM qv_images WHERE id = ?").get(id) as { mime: string; data: Uint8Array } | undefined;
  return row ? { mime: row.mime, data: Buffer.from(row.data) } : null;
}

export function imageIdsFor(questionId: number, db: DatabaseSync = getDb()): number[] {
  return (db.prepare("SELECT id FROM qv_images WHERE question_id = ? ORDER BY id").all(questionId) as { id: number }[]).map((r) => r.id);
}

/** Screenshots never attached to a question and older than a day (an abandoned import). */
export function purgeOrphanImages(db: DatabaseSync = getDb()): number {
  const info = db.prepare("DELETE FROM qv_images WHERE question_id IS NULL AND created_at < datetime('now', '-1 day')").run();
  return Number(info.changes);
}
