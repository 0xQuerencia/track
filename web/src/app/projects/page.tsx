import { Donut } from "@/components/track/charts";
import { EntityPanel } from "@/components/track/entity-panel";
import { Page, Panel, SplitPanels, StatGrid } from "@/components/track/page";
import { StatCard } from "@/components/track/stat-card";
import { listRows } from "@/lib/crud";
import { backlogByStatus } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function ProjectsPage() {
  const projects = listRows("projects");
  const backlog = backlogByStatus();
  const count = (label: string) => backlog.find((b) => b.label === label)?.value ?? 0;

  return (
    <Page
      kicker="Projects"
      title="Projects"
      lede="Your repositories and what is next on each: assistant, TableTap, games and everything else you are building."
    >
      <StatGrid>
        <StatCard label="Active projects" value={projects.filter((p) => p.status === "Active").length} />
        <StatCard label="Backlog" value={count("Backlog")} />
        <StatCard label="In progress" value={count("Doing")} />
        <StatCard label="Done" value={count("Done")} />
      </StatGrid>
      <SplitPanels>
        <Panel title="Backlog by status">
          <Donut data={backlog} centerLabel="Items" emptyNote="Add backlog items to see the split." />
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
      <EntityPanel
        entityKey="projects"
        title="Projects"
        rows={projects}
        columns={[
          { name: "name" },
          { name: "status", inline: true },
          { name: "milestone" },
          { name: "repo" },
          { name: "notes" },
        ]}
      />
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
    </Page>
  );
}
