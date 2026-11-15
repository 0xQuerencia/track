import Link from "next/link";
import { expiryBadge } from "@/lib/documents/expiry";
import type { DocumentRow } from "@/lib/documents/queries";
import { shortDay } from "@/lib/dates";

/* Server-rendered document pieces: table rows, badges, and the file summary. */

export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ExpiryChip({ expiresOn, today }: { expiresOn: string | null; today: string }) {
  const badge = expiryBadge(expiresOn, today);
  if (!badge) return <span className="docs-muted">No expiry</span>;
  return (
    <span className="docs-badge" data-tone={badge.tone}>
      {badge.label}
    </span>
  );
}

export function DocumentTable({ rows, today }: { rows: DocumentRow[]; today: string }) {
  return (
    <div className="tk-table-wrap">
      <table className="tk-table docs-table">
        <thead>
          <tr>
            <th scope="col">Document</th>
            <th scope="col">Category</th>
            <th scope="col">Expiry</th>
            <th scope="col">File</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} id={`documents-${row.id}`}>
              <td>
                <Link href={`/documents/${row.id}`} className="docs-title">
                  {row.title}
                </Link>
                {row.tags ? <span className="docs-muted">{row.tags}</span> : null}
              </td>
              <td>{row.category ?? "—"}</td>
              <td>
                <span className="docs-deadline">
                  {row.expires_on ? shortDay(row.expires_on) : ""}
                </span>
                <ExpiryChip expiresOn={row.expires_on} today={today} />
              </td>
              <td>
                {row.file_key ? (
                  <a href={`/api/documents/${row.id}/file`} className="docs-download">
                    Download
                  </a>
                ) : (
                  <span className="docs-muted">No file</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
