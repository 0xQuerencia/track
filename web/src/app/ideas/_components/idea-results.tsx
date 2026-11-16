import Link from "next/link";
import { Pager } from "@/components/track/pager";
import { shortDay } from "@/lib/dates";
import type { IdeaRow } from "@/lib/ideas/queries";
import type { IdeaView } from "@/lib/ideas/filters";
import { FlagButton } from "./flag-button";
import { StatusSelect } from "./status-select";

const dateOf = (stamp: string): string => shortDay(stamp.slice(0, 10));
const tagsOf = (tags: string | null): string[] => (tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : []);

function Card({ row }: { row: IdeaRow }) {
  return (
    <article className="id-card" data-pinned={row.pinned === 1 || undefined} data-status={row.status}>
      <header className="id-card-head">
        <h3>
          <Link href={`/ideas/${row.id}`}>{row.title}</Link>
        </h3>
        {row.pinned === 1 ? <span className="id-mark">Pinned</span> : null}
      </header>
      {row.excerpt ? <p className="id-card-excerpt">{row.excerpt}</p> : null}
      <footer className="id-card-meta">
        <span className="id-pill">{row.status}</span>
        <span>{row.category}</span>
        <span>{row.priority}</span>
        <time dateTime={row.updated_at}>{dateOf(row.updated_at)}</time>
      </footer>
      {tagsOf(row.tags).length ? (
        <ul className="id-tags" aria-label="Tags">
          {tagsOf(row.tags).map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function ListTable({ rows }: { rows: IdeaRow[] }) {
  return (
    <div className="tk-table-wrap">
      <table className="tk-table id-table">
        <thead>
          <tr>
            <th scope="col">Idea</th>
            <th scope="col">Status</th>
            <th scope="col">Category</th>
            <th scope="col">Priority</th>
            <th scope="col">Tags</th>
            <th scope="col">Updated</th>
            <th scope="col">
              <span className="tk-sr-only">Pin</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <Link href={`/ideas/${row.id}`}>{row.title}</Link>
                {row.pinned === 1 ? <span className="id-mark"> Pinned</span> : null}
              </td>
              <td>
                <StatusSelect id={row.id} title={row.title} value={row.status} />
              </td>
              <td>{row.category}</td>
              <td>{row.priority}</td>
              <td>{tagsOf(row.tags).join(", ") || "—"}</td>
              <td>
                <time dateTime={row.updated_at}>{dateOf(row.updated_at)}</time>
              </td>
              <td data-align="end">
                <FlagButton id={row.id} flag="pinned" value={row.pinned === 1} onLabel="Pin" offLabel="Unpin" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Board({ columns }: { columns: { status: string; total: number; rows: IdeaRow[] }[] }) {
  return (
    <div className="id-board" role="region" aria-label="Ideas by status">
      {columns.map((column) => (
        <section key={column.status} className="id-column" aria-labelledby={`col-${column.status}`}>
          <header className="id-column-head">
            <h3 id={`col-${column.status}`}>{column.status}</h3>
            <span className="tk-count">{column.total}</span>
          </header>
          {column.rows.length === 0 ? <p className="tk-empty-small">Nothing here.</p> : null}
          <ul className="id-column-list">
            {column.rows.map((row) => (
              <li key={row.id}>
                <div className="id-board-card">
                  <Link href={`/ideas/${row.id}`}>{row.title}</Link>
                  <span className="id-board-meta">
                    {row.category}
                    {row.pinned === 1 ? " · Pinned" : ""}
                  </span>
                  <StatusSelect id={row.id} title={row.title} value={row.status} />
                </div>
              </li>
            ))}
          </ul>
          {column.total > column.rows.length ? (
            <p className="tk-more">Showing {column.rows.length} of {column.total}. Narrow the filters to see the rest.</p>
          ) : null}
        </section>
      ))}
    </div>
  );
}

export function IdeaResults({
  view,
  rows,
  columns,
  page,
  buildHref,
}: {
  view: IdeaView;
  rows: IdeaRow[];
  columns: { status: string; total: number; rows: IdeaRow[] }[];
  page: { page: number; totalPages: number };
  buildHref: (page: number) => string;
}) {
  if (view === "board") return <Board columns={columns} />;
  if (rows.length === 0)
    return <p className="tk-empty">No ideas match these filters. Capture one above, or clear the filters.</p>;
  return (
    <>
      {view === "list" ? (
        <ListTable rows={rows} />
      ) : (
        <div className="id-card-grid">
          {rows.map((row) => (
            <Card key={row.id} row={row} />
          ))}
        </div>
      )}
      <Pager page={page.page} totalPages={page.totalPages} buildHref={buildHref} label="Idea pages" />
    </>
  );
}
