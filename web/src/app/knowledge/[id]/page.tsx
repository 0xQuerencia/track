import Link from "next/link";
import { notFound } from "next/navigation";
import { RelatedLinks } from "@/components/track/related-links";
import { Page, Panel } from "@/components/track/page";
import { shortDay } from "@/lib/dates";
import { listLinks } from "@/lib/links";
import { collectionOptions, getNote } from "@/lib/knowledge/queries";
import { getDb } from "@/lib/db";
import { isEntryEnabled } from "@/lib/dreamer/queries";
import { hrefWith } from "@/lib/knowledge/params";
import "@/styles/knowledge.css";
import "@/styles/dreamer.css";
import { Backlinks } from "../_components/backlinks";
import { NoteEditor, NoteToolbar } from "../_components/note-editor";
import { DreamerSourceToggle } from "@/app/dreamer/source-toggle";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^\d{1,9}$/;

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = ID_PATTERN.test(raw) ? Number(raw) : 0;
  const note = id > 0 ? getNote(id) : undefined;
  if (!note) notFound();

  const links = listLinks("notes", note.id);
  const collections = collectionOptions();

  return (
    <Page
      kicker={`Knowledge · ${note.kind}`}
      title={note.title}
      lede={`${note.collection_name ? `In ${note.collection_name} · ` : "Unfiled · "}last edited ${shortDay(note.updated_at.slice(0, 10))}`}
    >
      <p className="kn-back">
        <Link href={hrefWith("/knowledge", { tab: "notes" })}>← All notes</Link>
      </p>

      <NoteToolbar id={note.id} title={note.title} pinned={note.pinned === 1} />
      <DreamerSourceToggle source="note" refId={String(note.id)} enabled={isEntryEnabled(getDb(), "note", String(note.id))} />

      <div className="kn-detail">
        <Panel title="Note" description="Edits autosave as a local draft until you save.">
          <NoteEditor
            key={note.updated_at}
            id={note.id}
            pinned={note.pinned === 1}
            collections={collections}
            initial={{
              title: note.title,
              kind: note.kind,
              collection_id: note.collection_id === null ? "" : String(note.collection_id),
              tags: note.tags ?? "",
              body: note.body ?? "",
            }}
          />
        </Panel>

        <aside className="kn-side" aria-label="Backlinks and links">
          <Backlinks links={links} />
          <Panel title="Details">
            <dl className="kn-facts">
              <dt>Created</dt>
              <dd>{shortDay(note.created_at.slice(0, 10))}</dd>
              <dt>Last edited</dt>
              <dd>{shortDay(note.updated_at.slice(0, 10))}</dd>
            </dl>
          </Panel>
        </aside>
      </div>

      <RelatedLinks type="notes" id={note.id} links={links} />
    </Page>
  );
}
