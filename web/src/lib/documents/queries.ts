import type { SQLInputValue } from "node:sqlite";
import { addDays } from "../dates";
import { getDb } from "../db";
import { EXPIRY_ATTENTION_DAYS } from "./constants";

/* Read queries for the document vault. Values are bound; nothing from input is interpolated. */

export type DocumentRow = {
  id: number;
  title: string;
  category: string | null;
  tags: string | null;
  issued_on: string | null;
  expires_on: string | null;
  notes: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  file_key: string | null;
  checksum: string | null;
  created_at: string;
};

export type DocumentFilter = {
  q: string;
  category: string;
  /** "all", "attention" (expiring soon or expired), or "expired". */
  expiry: "all" | "attention" | "expired";
};

export const DOCUMENT_PAGE_SIZE = 25;

const escapeLike = (term: string): string => term.replace(/[\\%_]/g, (c) => `\\${c}`);

export function listDocuments(
  filter: DocumentFilter,
  page: number,
  today: string,
): { rows: DocumentRow[]; total: number; pageCount: number; page: number } {
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  if (filter.q) {
    const like = `%${escapeLike(filter.q)}%`;
    clauses.push(
      `(title LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\'
        OR file_name LIKE ? ESCAPE '\\')`,
    );
    params.push(like, like, like, like);
  }
  if (filter.category) {
    clauses.push("category = ?");
    params.push(filter.category);
  }
  if (filter.expiry === "attention") {
    clauses.push("expires_on IS NOT NULL AND expires_on <= ?");
    params.push(addDays(today, EXPIRY_ATTENTION_DAYS));
  } else if (filter.expiry === "expired") {
    clauses.push("expires_on IS NOT NULL AND expires_on < ?");
    params.push(today);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const db = getDb();
  const total = Number(
    (db.prepare(`SELECT COUNT(*) AS n FROM documents ${where}`).get(...params) as { n: number }).n,
  );
  const pageCount = Math.max(1, Math.ceil(total / DOCUMENT_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, Math.trunc(page)), pageCount);
  const rows = db
    .prepare(
      `SELECT * FROM documents ${where}
       ORDER BY expires_on IS NULL, expires_on, title COLLATE NOCASE, id
       LIMIT ? OFFSET ?`,
    )
    .all(...params, DOCUMENT_PAGE_SIZE, (safePage - 1) * DOCUMENT_PAGE_SIZE) as DocumentRow[];
  return { rows, total, pageCount, page: safePage };
}

export function getDocument(id: number): DocumentRow | null {
  const row = getDb().prepare("SELECT * FROM documents WHERE id = ?").get(id);
  return (row as DocumentRow | undefined) ?? null;
}

export type DocumentStats = {
  total: number;
  withFile: number;
  attention: number;
  expired: number;
};

export function documentStats(today: string): DocumentStats {
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN file_key IS NOT NULL THEN 1 ELSE 0 END), 0) AS withFile,
         COALESCE(SUM(CASE WHEN expires_on IS NOT NULL AND expires_on <= ? THEN 1 ELSE 0 END), 0)
           AS attention,
         COALESCE(SUM(CASE WHEN expires_on IS NOT NULL AND expires_on < ? THEN 1 ELSE 0 END), 0)
           AS expired
       FROM documents`,
    )
    .get(addDays(today, EXPIRY_ATTENTION_DAYS), today) as DocumentStats;
  return {
    total: Number(row.total),
    withFile: Number(row.withFile),
    attention: Number(row.attention),
    expired: Number(row.expired),
  };
}

/** The columns the download route needs, and nothing else. */
export function getDocumentFileInfo(
  id: number,
): { file_key: string | null; file_name: string | null; file_mime: string | null } | null {
  const row = getDb()
    .prepare("SELECT file_key, file_name, file_mime FROM documents WHERE id = ?")
    .get(id);
  return (row as { file_key: string | null; file_name: string | null; file_mime: string | null } | undefined) ?? null;
}
