import "@/styles/journal.css";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/track/markdown";
import { Page, Panel } from "@/components/track/page";
import { RelatedLinks } from "@/components/track/related-links";
import { shortDay } from "@/lib/dates";
import { getJournalEntry, allJournalTags, type JournalRow } from "@/lib/journal/entries";
import { listLinks } from "@/lib/links";
import { JournalComposer } from "../_components/journal-composer";
import { JournalDeleteButton } from "../_components/journal-delete-button";

export const dynamic = "force-dynamic";

const ENTRY_ID = /^\d{1,12}$/;

/** The entry's own page: the rendered reflection, editing, and links to goals and other records. */
export default async function JournalEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  if (!ENTRY_ID.test(raw)) notFound();
  const id = Number(raw);
  const entry = getJournalEntry(id);
  if (!entry) notFound();

  const title = entry.title || `Untitled entry`;
  const date = entry.date ? shortDay(entry.date) : "No date";
  return (
    <Page kicker="Journal" title={title} lede={`${date}${entry.mood ? ` · mood ${entry.mood}/5` : ""}${entry.energy ? ` · energy ${entry.energy}/5` : ""}`}>
      <Panel title="Entry">
        <EntryMeta entry={entry} />
        <div className="journal-body">
          <Markdown source={entry.text} />
        </div>
        <div className="journal-entry-actions">
          <JournalDeleteButton id={entry.id} />
        </div>
      </Panel>
      <Panel title="Edit">
        <JournalComposer
          mode="edit"
          id={entry.id}
          defaultDate={entry.date ?? ""}
          tagHints={allJournalTags()}
          initial={{
            date: entry.date ?? "",
            title: entry.title ?? "",
            mood: entry.mood === null ? "" : String(entry.mood),
            energy: entry.energy === null ? "" : String(entry.energy),
            win: entry.win ?? "",
            setback: entry.setback ?? "",
            tags: entry.tags ?? "",
            text: entry.text ?? "",
          }}
        />
      </Panel>
      <RelatedLinks type="journal_entries" id={entry.id} links={listLinks("journal_entries", entry.id)} title="Goals, projects and other records" />
    </Page>
  );
}

function EntryMeta({ entry }: { entry: JournalRow }) {
  const rows: [string, string][] = [];
  if (entry.win) rows.push(["A win", entry.win]);
  if (entry.setback) rows.push(["A setback", entry.setback]);
  if (entry.tags) rows.push(["Tags", entry.tags]);
  if (rows.length === 0) return null;
  return (
    <dl className="journal-meta">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
