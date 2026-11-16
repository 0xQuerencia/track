import { addDays, daysUntil, todayStr } from "../dates";
import { getDb } from "../db";

/*
 * Public surface of the document vault for other features. Metadata only:
 * nothing here reads stored file bytes.
 */

export type ExpiringDocument = {
  id: number;
  title: string;
  category: string | null;
  /** YYYY-MM-DD. */
  expiresOn: string;
  /** Negative when already expired. */
  daysLeft: number;
  expired: boolean;
  href: string;
};

const MAX_DAYS = 365;
const MAX_ROWS = 200;

/**
 * Documents that have expired or will expire within `days` days from today,
 * soonest first. Already-expired documents are included, since they still
 * need renewing.
 */
export function getExpiringDocuments(days: number): ExpiringDocument[] {
  const today = todayStr();
  const window = Math.min(MAX_DAYS, Math.max(0, Math.trunc(Number(days)) || 0));
  const rows = getDb()
    .prepare(
      `SELECT id, title, category, expires_on FROM documents
       WHERE expires_on IS NOT NULL AND expires_on <= ?
       ORDER BY expires_on, id
       LIMIT ?`,
    )
    .all(addDays(today, window), MAX_ROWS) as {
    id: number;
    title: string;
    category: string | null;
    expires_on: string;
  }[];
  return rows.map((row) => {
    const daysLeft = daysUntil(row.expires_on, today);
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      expiresOn: row.expires_on,
      daysLeft,
      expired: daysLeft < 0,
      href: `/documents/${row.id}`,
    };
  });
}
