import type { ReactNode } from "react";
import { deleteStudyRecordAction } from "../actions";
import type { Row } from "@/lib/crud";
import { getEntity } from "@/lib/entities";
import { todayStr } from "@/lib/dates";
import { RecordForm, type ChapterOption } from "./record-form";
import { RemoveButton } from "./remove-button";

export type RecordColumn = { label: string; render: (row: Row) => ReactNode };

/**
 * A table plus add form for a study record type. Rows get the id
 * "<entity>-<id>" so search results can link to them.
 */
export function RecordPanel({
  entityKey,
  title,
  description,
  rows,
  columns,
  chapters,
  limit = 50,
}: {
  entityKey: string;
  title: string;
  description?: string;
  rows: Row[];
  columns: RecordColumn[];
  chapters: ChapterOption[];
  limit?: number;
}) {
  const entity = getEntity(entityKey);
  if (!entity) throw new Error(`Unknown entity: ${entityKey}`);
  const defaults: Record<string, string | number> = {};
  for (const field of entity.fields) {
    if (field.default === "today") defaults[field.name] = todayStr();
    else if (field.default !== undefined) defaults[field.name] = field.default;
  }
  const shown = rows.slice(0, limit);
  const remove = deleteStudyRecordAction.bind(null, entity.key);

  return (
    <section className="tk-panel" aria-label={title}>
      <header className="tk-panel-head">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <span className="tk-count">{rows.length}</span>
      </header>
      <details className="tk-add" open={rows.length === 0}>
        <summary>Add {entity.singular.toLowerCase()}</summary>
        <RecordForm
          entityKey={entity.key}
          fields={entity.fields}
          defaults={defaults}
          chapters={chapters}
          submitLabel={`Add ${entity.singular.toLowerCase()}`}
        />
      </details>
      {shown.length === 0 ? (
        <p className="tk-empty">No {entity.plural.toLowerCase()} yet.</p>
      ) : (
        <div className="tk-table-wrap">
          <table className="tk-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.label} scope="col">
                    {column.label}
                  </th>
                ))}
                <th scope="col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} id={`${entity.key}-${row.id}`}>
                  {columns.map((column) => (
                    <td key={column.label}>{column.render(row)}</td>
                  ))}
                  <td data-align="end">
                    <RemoveButton
                      id={row.id}
                      label={`${entity.singular} ${row.id}`}
                      remove={remove}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit ? (
        <p className="tk-more">Showing the latest {limit} of {rows.length}.</p>
      ) : null}
    </section>
  );
}
