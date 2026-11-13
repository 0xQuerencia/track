import Link from "next/link";
import { Donut } from "@/components/track/charts";
import { EntityPanel } from "@/components/track/entity-panel";
import { Page, Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { listRows } from "@/lib/crud";
import { getEntity } from "@/lib/entities";
import { mediaByKind, mediaStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string | string[] }>;
}) {
  const kinds = getEntity("media_items")?.fields.find((f) => f.name === "kind")?.options ?? [];
  const { kind: rawKind } = await searchParams;
  const requested = Array.isArray(rawKind) ? rawKind[0] : rawKind;
  const kind = requested && kinds.includes(requested) ? requested : undefined;
  const stats = mediaStats();

  return (
    <Page
      kicker="Media"
      title="Media"
      lede="Anime, films, series, books, manga, games and podcasts: what you are on, what is next, and what you thought."
    >
      <StatGrid>
        <StatCard label="Tracked" value={stats.total} />
        <StatCard label="Finished" value={stats.done} />
        <StatCard label="Average rating" value={stats.avgRating} decimals={1} suffix="/10" />
      </StatGrid>
      <SplitPanels>
        <Panel title="By kind">
          <Donut data={mediaByKind()} centerLabel="Items" emptyNote="Add something to see the split." />
        </Panel>
        <Panel title="Filter">
          <nav className="tk-chips" aria-label="Filter by kind">
            <Link href="/media" className="tk-chip" aria-current={!kind ? "page" : undefined}>
              All
            </Link>
            {kinds.map((k) => (
              <Link
                key={k}
                href={`/media?kind=${encodeURIComponent(k)}`}
                className="tk-chip"
                aria-current={kind === k ? "page" : undefined}
              >
                {k}
              </Link>
            ))}
          </nav>
        </Panel>
      </SplitPanels>
      <EntityPanel
        entityKey="media_items"
        title={kind ? `${kind} list` : "Collection"}
        rows={listRows("media_items", { filter: kind ? { kind } : {} })}
        columns={[
          { name: "title" },
          { name: "kind" },
          { name: "status", inline: true },
          { name: "rating", inline: true },
          { name: "notes" },
        ]}
      />
    </Page>
  );
}
