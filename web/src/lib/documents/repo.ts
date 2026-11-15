import { createHash } from "node:crypto";
import { deleteRow } from "../crud";
import { getDb } from "../db";
import { getEntity } from "../entities";
import { coerceValue, type Value } from "../form";
import { newStorageKey, removeStoredFile, writeStoredFile } from "./storage";

/*
 * Writes for the document vault. The metadata row and the stored file are
 * kept consistent: a file is written before its row is committed, and removed
 * again if the row cannot be written.
 */

export type DocumentValues = Record<string, Value>;
export type ParsedDocument = { values: DocumentValues } | { error: string };

export type FileInput = {
  /** Sanitised name, for display and download only. */
  displayName: string;
  /** An allowed MIME type from upload.ts. */
  mime: string;
  bytes: Uint8Array;
};

/** The fields a user edits in the form. File fields are never set from a form. */
const META_FIELDS = ["title", "category", "tags", "issued_on", "expires_on", "notes"] as const;

export function parseDocumentMeta(formData: FormData): ParsedDocument {
  const entity = getEntity("documents");
  if (!entity) return { error: "Documents are not available." };
  const values: DocumentValues = {};
  for (const name of META_FIELDS) {
    const field = entity.fields.find((f) => f.name === name);
    if (!field) return { error: "Documents are not available." };
    const result = coerceValue(field, formData.get(name));
    if ("error" in result) return { error: result.error };
    values[name] = result.value;
  }
  const issued = values.issued_on;
  const expires = values.expires_on;
  if (typeof issued === "string" && typeof expires === "string" && expires < issued)
    return { error: "Expiry must be on or after the issue date." };
  return { values };
}

export function checksumOf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The file-related columns for a stored file, or null for "no file". */
function fileColumns(file: FileInput | null, key: string | null) {
  if (!file || !key) return { name: null, mime: null, size: null, key: null, checksum: null };
  return {
    name: file.displayName,
    mime: file.mime,
    size: file.bytes.byteLength,
    key,
    checksum: checksumOf(file.bytes),
  };
}

export async function createDocument(
  meta: DocumentValues,
  file: FileInput | null,
): Promise<number> {
  const key = file ? newStorageKey() : null;
  if (file && key) await writeStoredFile(key, file.bytes);
  const cols = fileColumns(file, key);
  try {
    const result = getDb()
      .prepare(
        `INSERT INTO documents
           (title, category, tags, issued_on, expires_on, notes,
            file_name, file_mime, file_size, file_key, checksum)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        meta.title ?? null,
        meta.category ?? null,
        meta.tags ?? null,
        meta.issued_on ?? null,
        meta.expires_on ?? null,
        meta.notes ?? null,
        cols.name,
        cols.mime,
        cols.size,
        cols.key,
        cols.checksum,
      );
    return Number(result.lastInsertRowid);
  } catch (error) {
    await removeStoredFile(key);
    throw error;
  }
}

export function updateDocumentMeta(id: number, meta: DocumentValues): boolean {
  const result = getDb()
    .prepare(
      `UPDATE documents
         SET title = ?, category = ?, tags = ?, issued_on = ?, expires_on = ?, notes = ?
       WHERE id = ?`,
    )
    .run(
      meta.title ?? null,
      meta.category ?? null,
      meta.tags ?? null,
      meta.issued_on ?? null,
      meta.expires_on ?? null,
      meta.notes ?? null,
      id,
    );
  return Number(result.changes) > 0;
}

type FileKeyRow = { file_key: string | null } | undefined;

function currentKey(id: number): { exists: boolean; key: string | null } {
  const row = getDb()
    .prepare("SELECT file_key FROM documents WHERE id = ?")
    .get(id) as FileKeyRow;
  return { exists: row !== undefined, key: row?.file_key ?? null };
}

/**
 * Attaches a file to a document, replacing any earlier one. The new file is
 * written first, and the old file is removed only after the row points at the
 * new one.
 */
export async function attachDocumentFile(id: number, file: FileInput): Promise<boolean> {
  const before = currentKey(id);
  if (!before.exists) return false;
  const key = newStorageKey();
  await writeStoredFile(key, file.bytes);
  const cols = fileColumns(file, key);
  try {
    const result = getDb()
      .prepare(
        `UPDATE documents
           SET file_name = ?, file_mime = ?, file_size = ?, file_key = ?, checksum = ?
         WHERE id = ?`,
      )
      .run(cols.name, cols.mime, cols.size, cols.key, cols.checksum, id);
    if (Number(result.changes) === 0) {
      await removeStoredFile(key);
      return false;
    }
  } catch (error) {
    await removeStoredFile(key);
    throw error;
  }
  if (before.key) await removeStoredFile(before.key);
  return true;
}

/** Detaches and deletes the file. The metadata row stays. */
export async function removeDocumentFile(id: number): Promise<boolean> {
  const before = currentKey(id);
  if (!before.exists) return false;
  getDb()
    .prepare(
      `UPDATE documents SET file_name = NULL, file_mime = NULL, file_size = NULL,
         file_key = NULL, checksum = NULL WHERE id = ?`,
    )
    .run(id);
  if (before.key) await removeStoredFile(before.key);
  return true;
}

/** Deletes the row, its links, and its stored file (best effort). */
export async function deleteDocument(id: number): Promise<boolean> {
  const before = currentKey(id);
  if (!before.exists) return false;
  deleteRow("documents", id);
  if (before.key) await removeStoredFile(before.key);
  return true;
}
