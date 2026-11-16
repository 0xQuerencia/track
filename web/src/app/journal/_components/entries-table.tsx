import Link from "next/link";
import { DeleteButton } from "@/components/track/row-controls";
import { shortDay } from "@/lib/dates";
import type { JournalRow } from "@/lib/journal/entries";
import { splitTags } from "@/lib/journal/reflect";

/** Entries as a table. Titles link to the entry page; the body is shown as an excerpt. */
export function EntriesTable({ entries }: { entries: JournalRow[] }) {
  return (
    <div className="tk-table-wrap">
      <table className="tk-table journal-table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Title</th>
            <th scope="col" data-align="end">Mood</th>
            <th scope="col" data-align="end">Energy</th>
            <th scope="col">Tags</th>
            <th scope="col">Reflection</th>
            <th scope="col" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} id={`journal_entries-${entry.id}`}>
              <td>{entry.date ? shortDay(entry.date) : "—"}</td>
              <td>
                <Link href={`/journal/${entry.id}`}>{entry.title || `Entry #${entry.id}`}</Link>
              </td>
              <td data-align="end">{entry.mood ?? "—"}</td>
              <td data-align="end">{entry.energy ?? "—"}</td>
              <td>
                {splitTags(entry.tags).map((tag) => (
                  <span key={tag} className="journal-tag">
                    {tag}
                  </span>
                ))}
              </td>
              <td>
                <p className="journal-excerpt">{entry.text || "—"}</p>
              </td>
              <td data-align="end">
                <DeleteButton entityKey="journal_entries" id={entry.id} label={`entry ${entry.id}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
