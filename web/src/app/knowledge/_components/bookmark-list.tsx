import { Pager } from "@/components/track/pager";
import type { BookmarkRow } from "@/lib/knowledge/queries";
import { BookmarkRowView } from "./bookmark-rows";

export function BookmarkList({
  rows,
  collections,
  page,
  buildHref,
}: {
  rows: BookmarkRow[];
  collections: { id: number; name: string }[];
  page: { page: number; totalPages: number };
  buildHref: (page: number) => string;
}) {
  if (rows.length === 0)
    return <p className="tk-empty">No bookmarks match these filters. Save a web address above, or clear the filters.</p>;
  return (
    <>
      <ul className="kn-list" aria-label="Bookmarks">
        {rows.map((row) => (
          <BookmarkRowView key={row.id} bookmark={row} collections={collections} />
        ))}
      </ul>
      <Pager page={page.page} totalPages={page.totalPages} buildHref={buildHref} label="Bookmark pages" />
    </>
  );
}
