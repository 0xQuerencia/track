import Link from "next/link";
import { Pager } from "@/components/track/pager";
import { shortDay } from "@/lib/dates";
import type { NoteRow } from "@/lib/knowledge/queries";

export function NoteList({
  rows,
  page,
  buildHref,
}: {
  rows: NoteRow[];
  page: { page: number; totalPages: number };
  buildHref: (page: number) => string;
}) {
  if (rows.length === 0)
    return <p className="tk-empty">No notes match these filters. Create one above, or clear the filters.</p>;
  return (
    <>
      <ul className="kn-list" aria-label="Notes">
        {rows.map((row) => (
          <li key={row.id} id={`notes-${row.id}`} className="kn-row" data-pinned={row.pinned === 1 || undefined}>
            <div className="kn-row-main">
              <Link href={`/knowledge/${row.id}`} className="kn-row-title">{row.title}</Link>
              <div className="kn-row-meta">
                <span className="kn-pill">{row.kind}</span>
                {row.collection_name ? <span>{row.collection_name}</span> : null}
                {row.tags ? <span>{row.tags}</span> : null}
                {row.pinned === 1 ? <span className="kn-mark">Pinned</span> : null}
              </div>
            </div>
            <time className="kn-row-date" dateTime={row.updated_at}>
              {shortDay(row.updated_at.slice(0, 10))}
            </time>
          </li>
        ))}
      </ul>
      <Pager page={page.page} totalPages={page.totalPages} buildHref={buildHref} label="Note pages" />
    </>
  );
}
