import type { ReactNode } from "react";
import { todayStr, shortDay } from "@/lib/dates";
import type { Row } from "@/lib/crud";
import { getEntity, type Field } from "@/lib/entities";
import { EntityForm } from "./entity-form";
import { DeleteButton, InlineField } from "./row-controls";

export type Column = {
  name: string;
  label?: string;
  /** Edit this field in place instead of showing it as text. */
  inline?: boolean;
  render?: (row: Row) => ReactNode;
  align?: "end";
};

function formatCell(field: Field, value: Row[string]): ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  switch (field.type) {
    case "date":
      return shortDay(String(value));
    case "boolean":
      return value === 1 ? "Yes" : "No";
    case "number":
      return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(
        Number(value),
      );
    case "url":
      return (
        <a href={String(value)} target="_blank" rel="noreferrer noopener">
          Open
        </a>
      );
    default:
      return String(value);
  }
}

/**
 * The standard "add form + table" block for a record type. The form fields
 * and validation come from the entity definition; `columns` only chooses what
 * the table shows and which cells are editable in place.
 */
export function EntityPanel({
  entityKey,
  rows,
  columns,
  title,
  description,
  empty,
  limit = 50,
  formOpen,
}: {
  entityKey: string;
  rows: Row[];
  columns?: Column[];
  title?: string;
  description?: string;
  empty?: string;
  limit?: number;
  formOpen?: boolean;
}) {
  const entity = getEntity(entityKey);
  if (!entity) throw new Error(`Unknown entity: ${entityKey}`);

  const fieldByName = new Map(entity.fields.map((f) => [f.name, f]));
  const cols: Column[] =
    columns ??
    entity.fields
      .filter((f) => f.type !== "textarea")
      .map((f) => ({ name: f.name }));
  const defaults: Record<string, string | number> = {};
  for (const f of entity.fields) {
    if (f.default === "today") defaults[f.name] = todayStr();
    else if (f.default !== undefined) defaults[f.name] = f.default;
  }
  const shown = rows.slice(0, limit);

  return (
    <section className="tk-panel" aria-label={title ?? entity.plural}>
      <header className="tk-panel-head">
        <div>
          <h2>{title ?? entity.plural}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <span className="tk-count">{rows.length}</span>
      </header>

      <details className="tk-add" open={formOpen ?? rows.length === 0}>
        <summary>Add {entity.singular.toLowerCase()}</summary>
        <EntityForm
          entityKey={entity.key}
          fields={entity.fields}
          defaults={defaults}
          submitLabel={`Add ${entity.singular.toLowerCase()}`}
        />
      </details>

      {shown.length === 0 ? (
        <p className="tk-empty">{empty ?? `No ${entity.plural.toLowerCase()} yet.`}</p>
      ) : (
        <div className="tk-table-wrap">
          <table className="tk-table">
            <thead>
              <tr>
                {cols.map((col) => (
                  <th
                    key={col.name}
                    scope="col"
                    data-align={col.align}
                  >
                    {col.label ?? fieldByName.get(col.name)?.label ?? col.name}
                  </th>
                ))}
                <th scope="col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  {cols.map((col) => {
                    const field = fieldByName.get(col.name);
                    return (
                      <td key={col.name} data-align={col.align}>
                        {col.render ? (
                          col.render(row)
                        ) : col.inline && field ? (
                          <InlineField
                            entityKey={entity.key}
                            id={row.id}
                            field={field}
                            value={row[col.name] ?? null}
                          />
                        ) : field ? (
                          formatCell(field, row[col.name])
                        ) : (
                          String(row[col.name] ?? "—")
                        )}
                      </td>
                    );
                  })}
                  <td data-align="end">
                    <DeleteButton
                      entityKey={entity.key}
                      id={row.id}
                      label={`${entity.singular} ${row.id}`}
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
