import "@/styles/media.css";
import Link from "next/link";
import { Donut } from "@/components/track/charts";
import { EntityPanel } from "@/components/track/entity-panel";
import { Page, Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { getEntity } from "@/lib/entities";
import {
  MEDIA_LISTS,
  MEDIA_SORTS,
  MEDIA_STATUS_FILTERS,
  listMedia,
  mediaStatusCounts,
  resolveMediaFilter,
  type MediaFilter,
  type ResolvedMediaFilter,
} from "@/lib/media/query";
import { mediaByKind, mediaStats } from "@/lib/queries";
import { ProgressCell } from "./_components/progress-cell";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** Builds a link that keeps every other filter, changing only the given keys. */
function hrefFor(state: ResolvedMediaFilter, patch: Partial<Record<"kind" | "status" | "list" | "q" | "sort", string | null>>): string {
  const kind = patch.kind === undefined ? state.kind : patch.kind;
  const status = patch.status === undefined ? state.status : patch.status;
  const list = patch.list === undefined ? state.list : patch.list;
  const q = patch.q === undefined ? state.q : patch.q;
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  if (status) params.set("status", status);
  if (list && list !== "all") params.set("list", list);
  if (q) params.set("q", q);
  if (state.sort !== "status") params.set("sort", state.sort);
  const query = params.toString();
  return query ? `/media?${query}` : "/media";
}

export default async function MediaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const raw: MediaFilter = {
    kind: first(params.kind),
    status: first(params.status),
    list: first(params.list),
    q: first(params.q),
    sort: first(params.sort),
  };
  const filter = resolveMediaFilter(raw);
  const kinds = getEntity("media_items")?.fields.find((f) => f.name === "kind")?.options ?? [];
  const stats = mediaStats();
  const counts = mediaStatusCounts();
  const rows = listMedia(filter);
  const heading = [filter.kind ?? MEDIA_LISTS[filter.list].label, filter.status].filter(Boolean).join(" · ");
  const filtered = Boolean(filter.q || filter.kind || filter.status || filter.list !== "all");

  return (
    <Page
      kicker="Media"
      title="Media"
      lede="Anime, films, series, books, manga, games and podcasts: what you are on, what is next, and what you thought."
    >
      <StatGrid>
        <StatCard label="Tracked" value={stats.total} />
        <StatCard label="In progress" value={counts["In progress"] ?? 0} />
        <StatCard label="Finished" value={stats.done} />
        <StatCard label="Average rating" value={stats.avgRating} decimals={1} suffix="/10" />
      </StatGrid>
      <SplitPanels>
        <Panel title="By kind">
          <Donut data={mediaByKind()} centerLabel="Items" emptyNote="Add something to see the split." />
        </Panel>
        <Panel title="Find" description="Filter by list, status or kind. Search looks at titles and notes.">
          <nav className="tk-chips media-lists" aria-label="Lists">
            {(Object.keys(MEDIA_LISTS) as (keyof typeof MEDIA_LISTS)[]).map((key) => (
              <Link
                key={key}
                href={hrefFor(filter, { list: key, kind: null })}
                className="tk-chip"
                aria-current={filter.list === key && !filter.kind ? "page" : undefined}
              >
                {MEDIA_LISTS[key].label}
              </Link>
            ))}
          </nav>
          <nav className="tk-chips media-status-tabs" aria-label="Filter by status">
            {MEDIA_STATUS_FILTERS.map((status) => {
              const active = (filter.status ?? "All") === status;
              return (
                <Link
                  key={status}
                  href={hrefFor(filter, { status: status === "All" ? null : status })}
                  className="tk-chip"
                  aria-current={active ? "page" : undefined}
                >
                  {status} <span className="media-count">{counts[status] ?? 0}</span>
                </Link>
              );
            })}
          </nav>
          <nav className="tk-chips" aria-label="Filter by kind">
            {kinds.map((kind) => (
              <Link
                key={kind}
                href={hrefFor(filter, { kind: filter.kind === kind ? null : kind })}
                className="tk-chip"
                aria-current={filter.kind === kind ? "page" : undefined}
              >
                {kind}
              </Link>
            ))}
          </nav>
          <form action="/media" method="get" className="media-search" role="search">
            {filter.list !== "all" ? <input type="hidden" name="list" value={filter.list} /> : null}
            {filter.status ? <input type="hidden" name="status" value={filter.status} /> : null}
            {filter.kind ? <input type="hidden" name="kind" value={filter.kind} /> : null}
            <label className="tk-field">
              <span>Search</span>
              <input type="search" name="q" defaultValue={filter.q} maxLength={80} placeholder="Title or notes" />
            </label>
            <label className="tk-field">
              <span>Sort by</span>
              <select name="sort" defaultValue={filter.sort}>
                {(Object.keys(MEDIA_SORTS) as (keyof typeof MEDIA_SORTS)[]).map((key) => (
                  <option key={key} value={key}>
                    {MEDIA_SORTS[key].label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="tk-button tk-primary">Apply</button>
            {filter.q || filter.kind || filter.status || filter.list !== "all" || filter.sort !== "status" ? (
              <Link href="/media" className="tk-button tk-ghost">Clear</Link>
            ) : null}
          </form>
        </Panel>
      </SplitPanels>
      <EntityPanel
        entityKey="media_items"
        title={heading || "Collection"}
        description={`${rows.length} shown.`}
        rows={rows}
        empty={filtered ? "Nothing matches these filters." : undefined}
        columns={[
          { name: "title" },
          { name: "kind" },
          { name: "status", inline: true },
          { name: "progress_current", label: "Progress", render: (row) => <ProgressCell row={row} /> },
          { name: "rating", inline: true },
          { name: "started_on", label: "Started" },
          { name: "finished_on", label: "Finished" },
          { name: "notes" },
        ]}
      />
    </Page>
  );
}
