import { getDb } from "../db";
import { deleteRow } from "../crud";
import { unlinkAllFor } from "../links";
import { inTransaction } from "./sql";
import { syncNoteMentions } from "./mentions";
import type { BookmarkInput, CollectionInput, NoteInput } from "./schemas";
import { urlLabel } from "./urls";

/*
 * Writes for notes, bookmarks and collections. Every value reaching these
 * functions has been through schemas.ts; collection references are checked
 * here too, because SQLite does not enforce foreign keys in this app.
 */

const NOW = "datetime('now')";

/** The id when that collection exists, otherwise null. */
export function existingCollectionId(id: number | null): number | null {
  if (id === null) return null;
  const row = getDb().prepare("SELECT id FROM collections WHERE id = ?").get(id);
  return row ? id : null;
}

export function createNote(input: NoteInput): number {
  return inTransaction(() => {
    const result = getDb()
      .prepare(
        `INSERT INTO notes (title, body, kind, collection_id, tags, pinned, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ${NOW})`,
      )
      .run(
        input.title,
        input.body,
        input.kind,
        existingCollectionId(input.collection_id),
        input.tags,
        input.pinned ? 1 : 0,
      );
    const id = Number(result.lastInsertRowid);
    syncNoteMentions(id, input.body);
    return id;
  });
}

/** Returns false when the note does not exist. */
export function updateNote(id: number, input: NoteInput): boolean {
  return inTransaction(() => {
    const result = getDb()
      .prepare(
        `UPDATE notes SET title = ?, body = ?, kind = ?, collection_id = ?, tags = ?, pinned = ?,
           updated_at = ${NOW}
         WHERE id = ?`,
      )
      .run(
        input.title,
        input.body,
        input.kind,
        existingCollectionId(input.collection_id),
        input.tags,
        input.pinned ? 1 : 0,
        id,
      );
    if (Number(result.changes) === 0) return false;
    syncNoteMentions(id, input.body);
    return true;
  });
}

export function setNotePinned(id: number, pinned: boolean): boolean {
  const result = getDb()
    .prepare(`UPDATE notes SET pinned = ?, updated_at = ${NOW} WHERE id = ?`)
    .run(pinned ? 1 : 0, id);
  return Number(result.changes) > 0;
}

/** Removes the note and every link touching it. */
export function deleteNote(id: number): void {
  deleteRow("notes", id);
}

export function createBookmark(input: BookmarkInput): number {
  const result = getDb()
    .prepare(
      `INSERT INTO bookmarks (url, title, description, tags, collection_id, pinned, saved_at)
       VALUES (?, ?, ?, ?, ?, ?, ${NOW})`,
    )
    .run(
      input.url,
      input.title ?? urlLabel(input.url),
      input.description,
      input.tags,
      existingCollectionId(input.collection_id),
      input.pinned ? 1 : 0,
    );
  return Number(result.lastInsertRowid);
}

export function updateBookmark(id: number, input: BookmarkInput): boolean {
  const result = getDb()
    .prepare(
      `UPDATE bookmarks SET url = ?, title = ?, description = ?, tags = ?, collection_id = ?, pinned = ?
       WHERE id = ?`,
    )
    .run(
      input.url,
      input.title ?? urlLabel(input.url),
      input.description,
      input.tags,
      existingCollectionId(input.collection_id),
      input.pinned ? 1 : 0,
      id,
    );
  return Number(result.changes) > 0;
}

export function setBookmarkPinned(id: number, pinned: boolean): boolean {
  const result = getDb()
    .prepare("UPDATE bookmarks SET pinned = ? WHERE id = ?")
    .run(pinned ? 1 : 0, id);
  return Number(result.changes) > 0;
}

export function deleteBookmark(id: number): void {
  deleteRow("bookmarks", id);
}

export function createCollection(input: CollectionInput): number {
  const result = getDb()
    .prepare("INSERT INTO collections (name, description) VALUES (?, ?)")
    .run(input.name, input.description);
  return Number(result.lastInsertRowid);
}

export function updateCollection(id: number, input: CollectionInput): boolean {
  const result = getDb()
    .prepare("UPDATE collections SET name = ?, description = ? WHERE id = ?")
    .run(input.name, input.description, id);
  return Number(result.changes) > 0;
}

/**
 * Deletes a collection. Its notes and bookmarks are kept and become
 * unfiled. Nothing else is removed.
 */
export function deleteCollection(id: number): boolean {
  return inTransaction(() => {
    const db = getDb();
    db.prepare("UPDATE notes SET collection_id = NULL WHERE collection_id = ?").run(id);
    db.prepare("UPDATE bookmarks SET collection_id = NULL WHERE collection_id = ?").run(id);
    unlinkAllFor("collections", String(id));
    const result = db.prepare("DELETE FROM collections WHERE id = ?").run(id);
    return Number(result.changes) > 0;
  });
}
