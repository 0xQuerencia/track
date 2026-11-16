import { getDb } from "../db";
import { addLink, removeLink } from "../links";

/*
 * Wiki-style references inside note bodies:
 *   [[note:12]]        a note by id
 *   [[Some title]]     a note whose title matches (case-insensitive), most recently edited first
 * Each reference becomes a record link from the note to the target with the
 * relation "mentions". Saving a note reconciles its own mention links, so
 * links for references that were removed disappear. Only links this module
 * creates (from a note, relation "mentions") are ever removed.
 */

export const MAX_MENTIONS_PER_NOTE = 50;
const WIKI_LINK = /\[\[([^[\]\n]{1,200})\]\]/g;
const ID_REFERENCE = /^note:\s*(\d{1,9})$/i;

export type WikiTarget = { kind: "id"; id: number } | { kind: "title"; title: string };

/** Extracts unique [[...]] targets from a note body, in order of appearance. */
export function parseWikiLinks(body: string | null | undefined): WikiTarget[] {
  const seen = new Set<string>();
  const targets: WikiTarget[] = [];
  for (const match of (body ?? "").matchAll(WIKI_LINK)) {
    const inner = match[1].trim();
    const idMatch = ID_REFERENCE.exec(inner);
    const target: WikiTarget | null = idMatch
      ? { kind: "id", id: Number(idMatch[1]) }
      : inner.replace(/\s+/g, " ")
        ? { kind: "title", title: inner.replace(/\s+/g, " ") }
        : null;
    if (!target) continue;
    const key = target.kind === "id" ? `id:${target.id}` : `title:${target.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(target);
    if (targets.length >= MAX_MENTIONS_PER_NOTE) break;
  }
  return targets;
}

/** The note ids a body refers to. Unknown ids and titles are dropped; self references too. */
export function resolveMentionIds(noteId: number, body: string | null | undefined): Set<number> {
  const db = getDb();
  const ids = new Set<number>();
  for (const target of parseWikiLinks(body)) {
    if (target.kind === "id") {
      const row = db
        .prepare("SELECT id FROM notes WHERE id = ? AND id <> ?")
        .get(target.id, noteId) as { id: number } | undefined;
      if (row) ids.add(row.id);
      continue;
    }
    const row = db
      .prepare(
        `SELECT id FROM notes WHERE lower(trim(title)) = ? AND id <> ?
         ORDER BY updated_at DESC, id DESC LIMIT 1`,
      )
      .get(target.title.toLowerCase(), noteId) as { id: number } | undefined;
    if (row) ids.add(row.id);
  }
  return ids;
}

/**
 * Makes the note's "mentions" links match its body. Call inside the same
 * transaction as the note save. Returns how many links were added and removed.
 */
export function syncNoteMentions(
  noteId: number,
  body: string | null | undefined,
): { added: number; removed: number } {
  const wanted = resolveMentionIds(noteId, body);
  const existing = getDb()
    .prepare(
      `SELECT id, to_id FROM record_links
       WHERE from_type = 'notes' AND from_id = ? AND to_type = 'notes' AND relation = 'mentions'`,
    )
    .all(String(noteId)) as { id: number; to_id: string }[];

  let removed = 0;
  const present = new Set<number>();
  for (const link of existing) {
    const targetId = Number(link.to_id);
    if (wanted.has(targetId)) {
      present.add(targetId);
    } else if (removeLink(link.id)) {
      removed += 1;
    }
  }

  let added = 0;
  for (const targetId of wanted) {
    if (present.has(targetId)) continue;
    const result = addLink({
      from: { type: "notes", id: String(noteId) },
      to: { type: "notes", id: String(targetId) },
      relation: "mentions",
    });
    if (result.ok && result.created) added += 1;
  }
  return { added, removed };
}
