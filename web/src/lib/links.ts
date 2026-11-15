import { getDb } from "./db";
import { getEntity } from "./entities";
import {
  isLinkRelation,
  isLinkType,
  linkTypeLabel,
  type LinkRelation,
  type LinkView,
} from "./link-types";

/*
 * Typed links between records. Inputs arrive from forms and server actions,
 * so every field is validated here, not trusted from the caller.
 */

export type RecordRef = { type: string; id: string };
export type LinkResult = { ok: true; created: boolean } | { ok: false; error: string };

export type LinkInput = {
  from: { type: unknown; id: unknown };
  to: { type: unknown; id: unknown };
  relation?: unknown;
  note?: unknown;
};

type LinkRow = {
  id: number;
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  relation: string;
  note: string | null;
  created_at: string;
};

const MAX_ID_LENGTH = 200;
const MAX_NOTE_LENGTH = 500;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const INTEGER_ID = /^\d+$/;

export function parseRef(
  type: unknown,
  id: unknown,
): { ok: true; ref: RecordRef } | { ok: false; error: string } {
  if (typeof type !== "string" || !isLinkType(type))
    return { ok: false, error: "Unknown link type." };
  const text =
    typeof id === "number" ? String(id) : typeof id === "string" ? id.trim() : "";
  if (!text || text.length > MAX_ID_LENGTH || CONTROL_CHARACTERS.test(text))
    return { ok: false, error: "Invalid record id." };
  if (getEntity(type) && !INTEGER_ID.test(text))
    return { ok: false, error: "Invalid record id." };
  return { ok: true, ref: { type, id: text } };
}

/** Entity records must exist; other kinds are referenced by id only. */
function recordExists(ref: RecordRef): boolean {
  const entity = getEntity(ref.type);
  if (!entity) return true;
  const row = getDb()
    .prepare(`SELECT 1 FROM "${entity.key}" WHERE id = ?`)
    .get(Number(ref.id));
  return row !== undefined;
}

function resolveTitle(ref: RecordRef): string {
  const entity = getEntity(ref.type);
  if (!entity) return ref.id;
  const row = getDb()
    .prepare(`SELECT "${entity.titleField}" AS title FROM "${entity.key}" WHERE id = ?`)
    .get(Number(ref.id)) as { title: string | null } | undefined;
  if (!row) return `Missing ${entity.singular.toLowerCase()} #${ref.id}`;
  return row.title ?? `${entity.singular} #${ref.id}`;
}

/**
 * Adds a link. Identical links are ignored (created is false), so repeating
 * the same action is harmless.
 */
export function addLink(input: LinkInput): LinkResult {
  const from = parseRef(input.from.type, input.from.id);
  if (!from.ok) return from;
  const to = parseRef(input.to.type, input.to.id);
  if (!to.ok) return to;
  if (from.ref.type === to.ref.type && from.ref.id === to.ref.id)
    return { ok: false, error: "A record cannot link to itself." };

  const relation = input.relation ?? "related";
  if (typeof relation !== "string" || !isLinkRelation(relation))
    return { ok: false, error: "Unknown relation." };

  const note =
    typeof input.note === "string" && input.note.trim()
      ? input.note.trim().slice(0, MAX_NOTE_LENGTH)
      : null;

  if (!recordExists(from.ref) || !recordExists(to.ref))
    return { ok: false, error: "Record not found." };

  const result = getDb()
    .prepare(
      `INSERT OR IGNORE INTO record_links
         (from_type, from_id, to_type, to_id, relation, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(from.ref.type, from.ref.id, to.ref.type, to.ref.id, relation, note);
  return { ok: true, created: Number(result.changes) > 0 };
}

/** Removes one link by its id, whichever end the caller is looking from. */
export function removeLink(linkId: unknown): boolean {
  const id = typeof linkId === "number" ? linkId : Number(linkId);
  if (!Number.isInteger(id) || id <= 0) return false;
  const result = getDb().prepare("DELETE FROM record_links WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}

function toView(row: LinkRow, self: RecordRef): LinkView {
  const outgoing = row.from_type === self.type && row.from_id === self.id;
  const other: RecordRef = outgoing
    ? { type: row.to_type, id: row.to_id }
    : { type: row.from_type, id: row.from_id };
  const entity = getEntity(other.type);
  return {
    id: row.id,
    direction: outgoing ? "out" : "in",
    relation: isLinkRelation(row.relation) ? (row.relation as LinkRelation) : "related",
    note: row.note,
    type: other.type,
    typeLabel: linkTypeLabel(other.type),
    recordId: other.id,
    title: resolveTitle(other),
    href: entity ? `${entity.href}#${entity.key}-${other.id}` : null,
    createdAt: row.created_at,
  };
}

/** Every link touching a record, from either direction, newest first. */
export function listLinks(type: string, id: string | number): LinkView[] {
  const self = parseRef(type, id);
  if (!self.ok) return [];
  const rows = getDb()
    .prepare(
      `SELECT * FROM record_links
       WHERE (from_type = ? AND from_id = ?) OR (to_type = ? AND to_id = ?)
       ORDER BY created_at DESC, id DESC`,
    )
    .all(self.ref.type, self.ref.id, self.ref.type, self.ref.id) as LinkRow[];
  return rows.map((row) => toView(row, self.ref));
}

/** Links pointing at a record: the other records that reference it. */
export function backlinks(type: string, id: string | number): LinkView[] {
  return listLinks(type, id).filter((link) => link.direction === "in");
}

/** Drops every link touching a record. Called when that record is deleted. */
export function unlinkAllFor(type: string, id: string): number {
  const result = getDb()
    .prepare(
      `DELETE FROM record_links
       WHERE (from_type = ? AND from_id = ?) OR (to_type = ? AND to_id = ?)`,
    )
    .run(type, id, type, id);
  return Number(result.changes);
}
