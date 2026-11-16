import Link from "next/link";
import { IDEA_CATEGORIES, IDEA_STATUSES } from "@/lib/entities-ext/ideas-knowledge";
import type { IdeaFilters, IdeaView } from "@/lib/ideas/filters";

/** A plain GET form, so every filter is part of the URL and works without script. */
export function FilterBar({
  filters,
  view,
  tags,
}: {
  filters: IdeaFilters;
  view: IdeaView;
  tags: { tag: string; count: number }[];
}) {
  return (
    <form className="tk-panel id-filters" method="get" action="/ideas" role="search" aria-label="Filter ideas">
      <input type="hidden" name="view" value={view} />
      <div className="id-filter-grid">
        <label className="tk-field">
          <span>Search</span>
          <input type="search" name="q" defaultValue={filters.q} maxLength={80} placeholder="Title, body or tag" />
        </label>
        <label className="tk-field">
          <span>Status</span>
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">Any status</option>
            {IDEA_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="tk-field">
          <span>Category</span>
          <select name="category" defaultValue={filters.category ?? ""}>
            <option value="">Any category</option>
            {IDEA_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="tk-field">
          <span>Tag</span>
          <select name="tag" defaultValue={filters.tag ?? ""}>
            <option value="">Any tag</option>
            {tags.map((item) => (
              <option key={item.tag} value={item.tag}>
                {item.tag} ({item.count})
              </option>
            ))}
            {filters.tag && !tags.some((item) => item.tag === filters.tag) ? (
              <option value={filters.tag}>{filters.tag}</option>
            ) : null}
          </select>
        </label>
        <label className="tk-field">
          <span>Archived</span>
          <select name="archived" defaultValue={filters.archived}>
            <option value="active">Hide archived</option>
            <option value="archived">Archived only</option>
            <option value="all">Show all</option>
          </select>
        </label>
        <label className="id-check">
          <input type="checkbox" name="pinned" value="1" defaultChecked={filters.pinned} />
          <span>Pinned only</span>
        </label>
      </div>
      <div className="tk-form-actions">
        <button type="submit" className="tk-button tk-primary">
          Apply filters
        </button>
        <Link href={`/ideas?view=${view}`} className="tk-button tk-ghost">
          Clear
        </Link>
      </div>
    </form>
  );
}
