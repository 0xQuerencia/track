import { fromPaise, toPaise } from "./format";

/*
 * CSV for spreadsheet export (RFC 4180 quoting, CRLF line ends). A cell that
 * starts with a character a spreadsheet would read as a formula gets a leading
 * apostrophe, so opening the file cannot run code: = + - @ tab CR.
 */

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

/** One cell as CSV text: formula-safe, then quoted if it holds a comma, quote or line break. */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Builds a CSV document from a header and rows. Ends with a CRLF, as RFC 4180 suggests. */
export function buildCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [header, ...rows].map((cells) => cells.map(escapeCsvCell).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export type TransactionExportRow = {
  date: string;
  kind: string;
  amount: number;
  category: string | null;
  note: string | null;
  project: string | null;
};

export const TRANSACTION_CSV_HEADER = [
  "date",
  "type",
  "amount_inr",
  "category",
  "note",
  "project",
] as const;

/** Transactions as CSV. Amounts are written with exactly two decimals, from integer paise. */
export function transactionsCsv(rows: readonly TransactionExportRow[]): string {
  return buildCsv(
    TRANSACTION_CSV_HEADER,
    rows.map((row) => [
      row.date,
      row.kind,
      fromPaise(toPaise(row.amount)).toFixed(2),
      row.category,
      row.note,
      row.project,
    ]),
  );
}
