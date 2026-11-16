import { getDb } from "../db";
import { listLinks } from "../links";
import type { LinkView } from "../link-types";
import type { ProjectStatus } from "./constants";
import { milestoneProgress, type Progress } from "./progress";
import { listRepoEvents, type RepoEventRow } from "./repo-events";

/*
 * Reads for the project detail page. Each function answers one tab's
 * question; the page only calls the ones the active tab needs.
 */

export type ProjectRecord = {
  id: number;
  name: string;
  status: ProjectStatus | string;
  repo: string | null;
  milestone: string | null;
  notes: string | null;
  category: string | null;
  description: string | null;
  tags: string | null;
  tech_stack: string | null;
  local_path: string | null;
  default_branch: string | null;
  current_branch: string | null;
  last_activity_at: string | null;
  last_commit_sha: string | null;
  last_commit_message: string | null;
  last_commit_at: string | null;
  milestone_date: string | null;
  external_id: string | null;
  source: string | null;
  archived: number;
  pinned: number;
  created_at: string | null;
};

export function getProject(id: number): ProjectRecord | null {
  if (!Number.isInteger(id) || id <= 0) return null;
  const row = getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id);
  return (row as unknown as ProjectRecord | undefined) ?? null;
}

export type MilestoneRecord = {
  id: number;
  project_id: number;
  title: string;
  due_date: string | null;
  status: "Planned" | "Doing" | "Done";
  sort_order: number;
  completed_at: string | null;
};

export function listMilestones(projectId: number): MilestoneRecord[] {
  return getDb()
    .prepare("SELECT * FROM project_milestones WHERE project_id = ? ORDER BY sort_order, id")
    .all(projectId) as unknown as MilestoneRecord[];
}

/** Progress from milestone rows only. Null percentage when the project has none. */
export function milestoneSummary(projectId: number): {
  progress: Progress;
  next: MilestoneRecord | null;
} {
  const milestones = listMilestones(projectId);
  const result = milestoneProgress(milestones);
  return {
    progress: result.progress,
    next: milestones.find((m) => m.status !== "Done") ?? null,
  };
}

export type HistoryRecord = {
  id: number;
  kind: string;
  detail: string | null;
  at: string;
};

export function listHistory(projectId: number, limit = 200): HistoryRecord[] {
  const cap = Math.min(500, Math.max(1, Math.trunc(limit)));
  return getDb()
    .prepare(
      `SELECT id, kind, detail, at FROM project_history WHERE project_id = ?
       ORDER BY at DESC, id DESC LIMIT ${cap}`,
    )
    .all(projectId) as unknown as HistoryRecord[];
}

/** Recent activity for the overview: repo events and history, merged newest first. */
export type ActivityItem = { at: string | null; text: string; source: "repo" | "history" };

export function recentActivity(projectId: number, limit = 8): ActivityItem[] {
  const repo: ActivityItem[] = listRepoEvents(projectId, { limit }).map((event: RepoEventRow) => ({
    at: event.occurred_at,
    text: `${event.kind}: ${event.title ?? event.external_id}`,
    source: "repo",
  }));
  const history: ActivityItem[] = listHistory(projectId, limit).map((entry) => ({
    at: entry.at,
    text: entry.detail ? `${entry.kind}: ${entry.detail}` : entry.kind,
    source: "history",
  }));
  return [...repo, ...history]
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .slice(0, limit);
}

/** Links that point at a session from this project (either direction). */
export function sessionLinks(projectId: number): LinkView[] {
  return listLinks("projects", projectId).filter(
    (link) => link.type === "ai_session" && link.relation === "session_of",
  );
}

