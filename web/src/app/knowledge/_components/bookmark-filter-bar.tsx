import Link from "next/link";
import type { BookmarkFilters } from "@/lib/knowledge/queries";

export function BookmarkFilterBar({
  filters,
  tags,
  collections,
}: {
  filters: BookmarkFilters;
  tags: { tag: string; count: number }[];
  collections: { id: number; name: string }[];
}) {
  return (
    <form className="tk-panel kn-filters" method="get" action="/knowledge" role="search" aria-label="Filter bookmarks">
      <input type="hidden" name="tab" value="bookmarks" />
      <div className="kn-filter-grid">
        <label className="tk-field">
          <span>Search</span>
          <input type="search" name="q" defaultValue={filters.q} maxLength={80} placeholder="Title, address or tag" />
        </label>
        <label className="tk-field">
          <span>Collection</span>
          <select name="collection" defaultValue={filters.collection ?? ""}>
            <option value="">Any collection</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>{collection.name}</option>
            ))}
          </select>
        </label>
        <label className="tk-field">
          <span>Tag</span>
          <select name="tag" defaultValue={filters.tag ?? ""}>
            <option value="">Any tag</option>
            {tags.map((item) => (
              <option key={item.tag} value={item.tag}>{item.tag} ({item.count})</option>
            ))}
          </select>
        </label>
      </div>
      <div className="tk-form-actions">
        <button type="submit" className="tk-button tk-primary">Apply</button>
        <Link href="/knowledge?tab=bookmarks" className="tk-button tk-ghost">Clear</Link>
      </div>
    </form>
  );
}
