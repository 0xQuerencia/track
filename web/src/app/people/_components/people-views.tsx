import Link from "next/link";
import { ConfirmActionButton } from "@/components/track/confirm-action";
import type { ImportantOccurrence } from "@/lib/people/index";
import type { ImportantDateRow, PersonRow } from "@/lib/people/queries";
import { shortDay } from "@/lib/dates";
import { deleteImportantDateAction, updateImportantDateAction } from "../actions";
import { ImportantDateForm } from "./date-form";

/* Server-rendered pieces of the people pages. */

export function UpcomingDates({ items }: { items: ImportantOccurrence[] }) {
  if (items.length === 0)
    return <p className="tk-empty">Nothing in the next 60 days.</p>;
  return (
    <ol className="people-upcoming">
      {items.map((item) => (
        <li key={`${item.source}-${item.id}-${item.date}`}>
          <time dateTime={item.date}>{shortDay(item.date)}</time>
          <a href={item.href}>{item.title}</a>
          <small>{item.kind}</small>
        </li>
      ))}
    </ol>
  );
}

export function PeopleTable({ rows, tag }: { rows: PersonRow[]; tag: string }) {
  return (
    <div className="tk-table-wrap">
      <table className="tk-table people-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Relationship</th>
            <th scope="col">Birthday</th>
            <th scope="col">Last contacted</th>
            <th scope="col">Tags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} id={`people-${row.id}`}>
              <td>
                <Link href={`/people/${row.id}`} className="people-name">
                  {row.name}
                </Link>
              </td>
              <td>{row.relationship ?? "—"}</td>
              <td>{row.birthday ?? "—"}</td>
              <td>{row.last_contacted ? shortDay(row.last_contacted) : "—"}</td>
              <td>
                <TagList tags={row.tags} activeTag={tag} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tags as links that filter the list to that tag. */
export function TagList({
  tags,
  activeTag,
}: {
  tags: string | null;
  activeTag?: string;
}) {
  if (!tags) return <span className="people-muted">—</span>;
  return (
    <span className="people-tags">
      {tags.split(",").map((raw) => {
        const tag = raw.trim();
        if (!tag) return null;
        const active = tag === activeTag;
        return (
          <Link
            key={tag}
            href={`/people?tag=${encodeURIComponent(tag)}`}
            className="people-tag"
            aria-current={active ? "true" : undefined}
          >
            {tag}
          </Link>
        );
      })}
    </span>
  );
}

export function DateEditors({
  rows,
  people,
}: {
  rows: ImportantDateRow[];
  people: { id: number; name: string }[];
}) {
  return (
    <ul className="people-dates">
      {rows.map((row) => (
        <li key={row.id} id={`important_dates-${row.id}`}>
          <div className="people-date-head">
            <time dateTime={row.date}>{shortDay(row.date)}</time>
            <span>
              <strong>{row.title}</strong>
              <small>
                {row.kind}
                {row.repeat_yearly ? " · yearly" : ""}
                {row.person_name ? ` · ${row.person_name}` : ""}
              </small>
            </span>
            <details className="people-edit">
              <summary>Edit</summary>
              <ImportantDateForm
                action={updateImportantDateAction.bind(null, row.id)}
                people={people}
                submitLabel="Save date"
                defaults={{
                  title: row.title,
                  date: row.date,
                  person_id: row.person_id,
                  kind: row.kind,
                  repeat_yearly: row.repeat_yearly === 1,
                  remind_days_before: row.remind_days_before,
                }}
              />
            </details>
            <ConfirmActionButton
              label={row.title}
              action={deleteImportantDateAction.bind(null, row.id)}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
