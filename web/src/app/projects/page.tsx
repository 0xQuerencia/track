import { Donut } from "@/components/track/charts";
import { EntityPanel } from "@/components/track/entity-panel";
import { Page, Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { listRows } from "@/lib/crud";
import { backlogByStatus } from "@/lib/queries";
import { parseLibraryParams } from "@/lib/projects/filters";
import {
  libraryFacets,
  listKanban,
  listProjects,
  projectStatusCounts,
  unlinkedBacklogCount,
} from "@/lib/projects/library";
import { Kanban } from "./_components/kanban";
import { ProjectCard } from "./_components/project-card";
import { ProjectForm } from "./_components/project-form";
import { ProjectList, ProjectTable } from "./_components/project-rows";
import { InventoryImport } from "./_components/inventory-import";
import { LibraryToolbar, Pager, ViewSwitch } from "./_components/library-parts";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const EMPTY_FORM = {
  name: "",
  status: "Active",
  category: "",
  repo: "",
  local_path: "",
  description: "",
  tags: "",
  tech_stack: "",
  milestone_date: "",
  notes: "",
  pinned: false,
};

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = parseLibraryParams(await searchParams);
  const backlog = backlogByStatus();
  const count = (label: string) => backlog.find((b) => b.label === label)?.value ?? 0;
  const statuses = projectStatusCounts();
  const facets = libraryFacets();
  const isKanban = query.view === "kanban";
  const result = isKanban ? null : listProjects(query);
  const columns = isKanban ? listKanban(query) : null;
  const unlinked = unlinkedBacklogCount();

  return (
    <Page
      kicker="Projects"
      title="Projects"
      lede="Your repositories and what is next on each: assistant, TableTap, games and everything else you are building."
    >
      <StatGrid>
        <StatCard label="Active projects" value={statuses.Active ?? 0} />
        <StatCard label="Ideas" value={statuses.Idea ?? 0} />
        <StatCard label="Backlog" value={count("Backlog")} />
        <StatCard label="In progress" value={count("Doing")} />
      </StatGrid>

      <Panel title="Library" description="Filter, sort and switch layouts. Results come from stored records only.">
        <LibraryToolbar query={query} facets={facets} />
        <div className="pj-results-head">
          <ViewSwitch query={query} />
        </div>
        {isKanban && columns ? (
          <Kanban columns={columns} />
        ) : result && result.total === 0 ? (
          <p className="tk-empty">
            No projects match these filters. Add one under Manage below, or clear the filters.
          </p>
        ) : result ? (
          <>
            {query.view === "grid" ? (
              <div className="pj-grid">
                {result.rows.map((row) => <ProjectCard key={row.id} row={row} />)}
              </div>
            ) : null}
            {query.view === "list" ? <ProjectList rows={result.rows} /> : null}
            {query.view === "table" ? <ProjectTable rows={result.rows} /> : null}
            <Pager query={query} page={result.page} pageCount={result.pageCount} total={result.total} />
          </>
        ) : null}
      </Panel>

      <SplitPanels>
        <Panel title="Backlog by status">
          <Donut data={backlog} centerLabel="Items" emptyNote="Add backlog items to see the split." />
          {unlinked > 0 ? (
            <p className="tk-more">
              {unlinked} backlog {unlinked === 1 ? "item is" : "items are"} not linked to a project, usually because two
              projects share a name.
            </p>
          ) : null}
        </Panel>
        <Panel title="Releases" description="Add a backlog item with the kind “Release” to record one.">
          <ul className="tk-list">
            {listRows("project_items", { filter: { kind: "Release" }, limit: 5 }).map((item) => (
              <li key={item.id}>
                <span>{String(item.project)}: {String(item.title)}</span>
                <small>{String(item.status)}</small>
              </li>
            ))}
          </ul>
        </Panel>
      </SplitPanels>

      <Panel title="Manage" description="Add projects and backlog items, or import an inventory.">
        <details className="tk-add">
          <summary>Add a project</summary>
          <ProjectForm mode="create" defaults={EMPTY_FORM} />
        </details>
        <details className="tk-add">
          <summary>Import inventory</summary>
          <InventoryImport />
        </details>
        <EntityPanel
          entityKey="project_items"
          title="Backlog"
          rows={listRows("project_items")}
          columns={[
            { name: "project" },
            { name: "title" },
            { name: "kind" },
            { name: "status", inline: true },
          ]}
        />
      </Panel>
    </Page>
  );
}
