import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Page } from "@/components/track/page";
import { listLinks } from "@/lib/links";
import { REPO_EVENT_KINDS, TAB_IDS, type RepoEventKind, type TabId } from "@/lib/projects/constants";
import { getProject, listHistory, listMilestones, recentActivity } from "@/lib/projects/detail";
import { listResources } from "@/lib/projects/resources";
import { listTasks, taskProgress } from "@/lib/projects/tasks";
import { DevelopmentTab } from "../_components/development-tab";
import { HistoryTab } from "../_components/history-tab";
import { OverviewTab } from "../_components/overview-tab";
import { ProjectControls } from "../_components/project-controls";
import { ProjectSessionsPanel } from "../_components/project-sessions-panel";
import { ProgressMeter, StatusBadge } from "../_components/library-parts";
import { ResourcesPanel } from "../_components/resources-panel";
import { Roadmap } from "../_components/roadmap";
import { TaskBoard } from "../_components/task-board";
import { milestoneProgress } from "@/lib/projects/progress";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const TAB_LABEL: Record<TabId, string> = {
  overview: "Overview",
  tasks: "Tasks",
  development: "Development",
  sessions: "AI sessions",
  roadmap: "Roadmap",
  resources: "Resources",
  history: "History",
};

function firstValue(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw : "";
}

function tabFrom(value: string): TabId {
  return (TAB_IDS as readonly string[]).includes(value) ? (value as TabId) : "overview";
}

function kindFrom(value: string): RepoEventKind | null {
  return (REPO_EVENT_KINDS as readonly string[]).includes(value) ? (value as RepoEventKind) : null;
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const projectId = Number(id);
  const project = Number.isInteger(projectId) && projectId > 0 ? getProject(projectId) : null;
  if (!project) notFound();

  const search = await searchParams;
  const tab = tabFrom(firstValue(search.tab));
  const tabHref = (target: TabId) => `/projects/${project.id}${target === "overview" ? "" : `?tab=${target}`}`;

  let body: ReactNode;
  switch (tab) {
    case "overview":
      body = (
        <OverviewTab
          project={project}
          links={listLinks("projects", project.id)}
          activity={recentActivity(project.id)}
        />
      );
      break;
    case "tasks": {
      const tasks = listTasks(project.id);
      const { counts } = taskProgress(tasks);
      body = (
        <>
          <div className="pj-summary">
            <ProgressMeter done={counts.Done} total={tasks.length} emptyLabel="No tasks yet" />
            <span className="pj-muted">{counts.Backlog} backlog · {counts.Doing} doing · {counts.Done} done</span>
          </div>
          <TaskBoard projectId={project.id} tasks={tasks} />
        </>
      );
      break;
    }
    case "development":
      body = <DevelopmentTab project={project} kind={kindFrom(firstValue(search.kind))} />;
      break;
    case "sessions":
      body = <ProjectSessionsPanel projectId={project.id} />;
      break;
    case "roadmap": {
      const milestones = listMilestones(project.id);
      body = (
        <>
          <div className="pj-summary">
            <ProgressMeter
              done={milestoneProgress(milestones).progress.done}
              total={milestones.length}
            />
          </div>
          <Roadmap projectId={project.id} milestones={milestones} />
        </>
      );
      break;
    }
    case "resources":
      body = <ResourcesPanel projectId={project.id} resources={listResources(project.id)} />;
      break;
    case "history":
      body = <HistoryTab entries={listHistory(project.id)} />;
      break;
  }

  return (
    <Page kicker="Project" title={project.name} lede={project.description ?? undefined}>
      <div className="pj-detail-head">
        <div className="pj-detail-meta">
          <StatusBadge status={project.status} />
          {project.category ? <span className="pj-tag">{project.category}</span> : null}
          {project.archived === 1 ? <span className="pj-tag">Archived</span> : null}
          {project.pinned === 1 ? <span className="pj-tag" data-tone="accent">Pinned</span> : null}
          <Link className="pj-clear" href="/projects">All projects</Link>
        </div>
        <ProjectControls
          projectId={project.id}
          name={project.name}
          archived={project.archived === 1}
          pinned={project.pinned === 1}
        />
      </div>
      <nav className="pj-tabs" aria-label="Project sections">
        {TAB_IDS.map((item) => (
          <Link
            key={item}
            href={tabHref(item)}
            scroll={false}
            className="pj-tab"
            aria-current={tab === item ? "page" : undefined}
          >
            {TAB_LABEL[item]}
          </Link>
        ))}
      </nav>
      <section className="pj-tab-body" aria-label={TAB_LABEL[tab]}>
        {body}
      </section>
    </Page>
  );
}
