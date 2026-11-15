import { Page, Panel, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { NOTE_KINDS } from "@/lib/entities-ext/ideas-knowledge";
import { choice, hrefWith, positiveInt, pageNumber, text, type RawParams } from "@/lib/knowledge/params";
import {
  bookmarkTags,
  collectionOptions,
  knowledgeCounts,
  listBookmarks,
  listCollections,
  listNotes,
  noteTags,
  type BookmarkFilters,
  type NoteFilters,
} from "@/lib/knowledge/queries";
import { KNOWLEDGE_TABS, KnowledgeTabs, type KnowledgeTab } from "./_components/tabs";
import { BookmarkFilterBar } from "./_components/bookmark-filter-bar";
import { BookmarkList } from "./_components/bookmark-list";
import { BookmarkQuickCapture, NoteQuickCapture } from "./_components/capture-forms";
import { CollectionCreateForm, CollectionRowView } from "./_components/collection-rows";
import { NoteFilterBar } from "./_components/note-filter-bar";
import { NoteList } from "./_components/note-list";
import "@/styles/knowledge.css";

export const dynamic = "force-dynamic";

const SORTS = ["recent", "title"] as const;

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  const tab: KnowledgeTab = choice(raw, "tab", KNOWLEDGE_TABS) ?? "notes";
  const isNew = text(raw, "new", 4) === "1";
  const page = pageNumber(raw);
  const counts = knowledgeCounts();
  const collections = collectionOptions();

  return (
    <Page
      kicker="Personal"
      title="Knowledge"
      lede="Notes you write, pages you save, and the collections that group them. Refer to a note with [[its title]]."
    >
      <StatGrid>
        <StatCard label="Notes" value={counts.notes} />
        <StatCard label="Bookmarks" value={counts.bookmarks} />
        <StatCard label="Collections" value={counts.collections} />
      </StatGrid>

      <KnowledgeTabs active={tab} counts={{ notes: counts.notes, bookmarks: counts.bookmarks, collections: counts.collections }} />

      {tab === "notes" ? (
        <NotesTab raw={raw} page={page} collections={collections} autoFocus={isNew} />
      ) : tab === "bookmarks" ? (
        <BookmarksTab raw={raw} page={page} collections={collections} />
      ) : (
        <CollectionsTab raw={raw} page={page} />
      )}
    </Page>
  );
}

function NotesTab({
  raw,
  page,
  collections,
  autoFocus,
}: {
  raw: RawParams;
  page: number;
  collections: { id: number; name: string }[];
  autoFocus: boolean;
}) {
  const filters: NoteFilters = {
    q: text(raw, "q", 80),
    kind: choice(raw, "kind", NOTE_KINDS),
    tag: text(raw, "tag", 40) || null,
    collection: positiveInt(raw, "collection"),
    sort: choice(raw, "sort", SORTS) ?? "recent",
  };
  const result = listNotes(filters, page);
  const hrefFor = (overrides: Record<string, string | number | null>) =>
    hrefWith("/knowledge", {
      tab: "notes",
      q: filters.q,
      kind: filters.kind,
      tag: filters.tag,
      collection: filters.collection,
      sort: filters.sort === "recent" ? null : filters.sort,
      ...overrides,
    });
  return (
    <>
      <NoteQuickCapture collections={collections} autoFocus={autoFocus} />
      <NoteFilterBar filters={filters} tags={noteTags()} collections={collections} />
      <Panel title="Notes" description={`${result.page.total} ${result.page.total === 1 ? "note" : "notes"}. Pinned notes come first.`}>
        <NoteList rows={result.rows} page={result.page} buildHref={(next) => hrefFor({ page: next })} />
      </Panel>
    </>
  );
}

function BookmarksTab({
  raw,
  page,
  collections,
}: {
  raw: RawParams;
  page: number;
  collections: { id: number; name: string }[];
}) {
  const filters: BookmarkFilters = {
    q: text(raw, "q", 80),
    tag: text(raw, "tag", 40) || null,
    collection: positiveInt(raw, "collection"),
  };
  const result = listBookmarks(filters, page);
  const hrefFor = (overrides: Record<string, string | number | null>) =>
    hrefWith("/knowledge", {
      tab: "bookmarks",
      q: filters.q,
      tag: filters.tag,
      collection: filters.collection,
      ...overrides,
    });
  return (
    <>
      <BookmarkQuickCapture collections={collections} />
      <BookmarkFilterBar filters={filters} tags={bookmarkTags()} collections={collections} />
      <Panel title="Bookmarks" description={`${result.page.total} saved. Only the address is stored; nothing is fetched.`}>
        <BookmarkList rows={result.rows} collections={collections} page={result.page} buildHref={(next) => hrefFor({ page: next })} />
      </Panel>
    </>
  );
}

function CollectionsTab({ raw, page }: { raw: RawParams; page: number }) {
  const q = text(raw, "q", 80);
  const result = listCollections(q, page);
  return (
    <>
      <CollectionCreateForm />
      <Panel title="Collections" description="Open one to see its notes. Deleting a collection keeps its notes and bookmarks, unfiled.">
        {result.rows.length === 0 ? (
          <p className="tk-empty">No collections yet. Create one above to group notes and bookmarks.</p>
        ) : (
          <ul className="kn-list" aria-label="Collections">
            {result.rows.map((row) => (
              <CollectionRowView key={row.id} collection={row} />
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
