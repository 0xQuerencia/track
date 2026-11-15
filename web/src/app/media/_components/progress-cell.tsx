import { InlineField } from "@/components/track/row-controls";
import type { Row } from "@/lib/crud";
import { getEntity } from "@/lib/entities";
import { progressPercent } from "@/lib/media/query";

/** Progress as "done / total" with a bar. Done is editable in place; nothing is shown that was not recorded. */
export function ProgressCell({ row }: { row: Row }) {
  const field = getEntity("media_items")?.fields.find((f) => f.name === "progress_current");
  const total = row.progress_total;
  const percent = progressPercent(row.progress_current, total);
  return (
    <span className="media-progress">
      {field ? (
        <InlineField
          entityKey="media_items"
          id={row.id}
          field={field}
          value={row.progress_current ?? null}
        />
      ) : null}
      <span className="media-progress-total">/ {total === null || total === undefined || total === "" ? "—" : String(total)}</span>
      {percent !== null ? (
        <progress max={100} value={percent} aria-label={`${percent}% through`} title={`${percent}%`} />
      ) : null}
    </span>
  );
}
