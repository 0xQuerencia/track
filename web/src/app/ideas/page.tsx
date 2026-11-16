import Link from "next/link";
import { Page, Panel, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { IDEA_VIEWS, parseIdeaParams, type IdeaFilters, type IdeaView } from "@/lib/ideas/filters";
import { boardColumns, ideaTags, listIdeas, statusCounts } from "@/lib/ideas/queries";
import { hrefWith, text, type RawParams } from "@/lib/knowledge/params";
import "@/styles/ideas.css";
import "@/styles/knowledge.css";
import { FilterBar } from "./_components/filter-bar";
import { IdeaResults } from "./_components/idea-results";
import { QuickCapture } from "./_components/quick-capture";

export const dynamic = "force-dynamic";

const VIEW_LABELS: Record<IdeaView, string> = { cards: "Cards", list: "List", board: "Board" };

/** The list's URL state as plain values, so links keep every active filter. */
function stateParams(filters: IdeaFilters, view: IdeaView): Record<string, string | boolean | null> {
  return {
    view,
    q: filters.q,
    status: filters.status,
    category: filters.category,
    tag: filters.tag,
    pinned: filters.pinned,
    archived: filters.archived === "active" ? null : filters.archived,
  };
}

export default async function IdeasPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  const { filters, view, page: requestedPage } = parseIdeaParams(raw);
  const counts = statusCounts();
  const tags = ideaTags();
  const current = stateParams(filters, view);
  const hrefFor = (overrides: Record<string, string | number | boolean | null>) =>
    hrefWith("/ideas", { ...current, ...overrides });

  const list = view === "board" ? null : listIdeas(filters, requestedPage);
  const columns = view === "board" ? boardColumns(filters) : [];
  const matching =
    view === "board" ? columns.reduce((sum, column) => sum + column.total, 0) : (list?.page.total ?? 0);

  return (
    <Page
      kicker="Work"
      title="Ideas"
      lede="A vault for things worth remembering: capture fast, sort later, and turn the good ones into projects."
    >
      <StatGrid>
        <StatCard label="Inbox" value={counts.Inbox} hint="waiting to be sorted" />
        <StatCard label="Exploring" value={counts.Exploring} />
        <StatCard label="Building" value={counts.Building} />
        <StatCard label="Archived" value={counts.archived} />
      </StatGrid>

      <QuickCapture autoFocus={text(raw, "new", 4) === "1"} />

      <FilterBar filters={filters} view={view} tags={tags} />

      <Panel
        title="Results"
        description={`${matching} ${matching === 1 ? "idea matches" : "ideas match"} the current filters.`}
      >
        <nav className="id-views" aria-label="View">
          {IDEA_VIEWS.map((option) => (
            <Link
              key={option}
              href={hrefFor({ view: option })}
              aria-current={option === view ? "page" : undefined}
              className="id-view-link"
            >
              {VIEW_LABELS[option]}
            </Link>
          ))}
        </nav>
        <IdeaResults
          view={view}
          rows={list?.rows ?? []}
          columns={columns}
          page={list?.page ?? { page: 1, totalPages: 1 }}
          buildHref={(page) => hrefFor({ page })}
        />
      </Panel>
    </Page>
  );
}
