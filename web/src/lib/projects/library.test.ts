import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { addLink } from "../links";
import { closeTestDb, installTestDb } from "../testing/test-db";
import { parseLibraryParams, type LibraryQuery } from "./filters";
import { libraryFacets, listKanban, listProjects } from "./library";
import { createMilestone, moveMilestone, setMilestoneStatus } from "./milestones";
import { listHistory, listMilestones, milestoneSummary, recentActivity } from "./detail";
import { listLinkedSessions } from "./sessions";
import { createTask, listTasks, moveTask, taskProgress } from "./tasks";
import { createProject, setArchived, updateProject } from "./write";

type Seed = Partial<Parameters<typeof createProject>[0]>;

function project(name: string, extra: Seed = {}): number {
  return createProject({
    name,
    status: "Active",
    category: null,
    repo: null,
    local_path: null,
    description: null,
    tags: [],
    tech_stack: [],
    milestone_date: null,
    notes: null,
    ...extra,
  });
}

function query(params: Record<string, string>): LibraryQuery {
  return parseLibraryParams(params);
}

describe("project library queries", () => {
  beforeEach(() => {
    installTestDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("paginates at 24 per page and counts the real total", () => {
    for (let i = 1; i <= 30; i++) project(`Project ${String(i).padStart(2, "0")}`);
    const first = listProjects(query({}));
    assert.equal(first.rows.length, 24);
    assert.equal(first.total, 30);
    assert.equal(first.pageCount, 2);
    const second = listProjects(query({ page: "2" }));
    assert.equal(second.rows.length, 6);
    assert.equal(second.page, 2);
    const beyond = listProjects(query({ page: "9" }));
    assert.equal(beyond.page, 2, "a page past the end is clamped to the last one");
  });

  it("hides archived projects unless asked, and can show only them", () => {
    const keep = project("Keep");
    const old = project("Old");
    setArchived(old, true);
    assert.deepEqual(listProjects(query({})).rows.map((r) => r.name), ["Keep"]);
    assert.equal(listProjects(query({ archived: "show" })).total, 2);
    assert.deepEqual(listProjects(query({ archived: "only" })).rows.map((r) => r.id), [old]);
    assert.ok(keep > 0);
  });

  it("filters by status, category, tag, tech, repository and text", () => {
    project("Alpha", {
      status: "Active",
      category: "app",
      tags: ["AI", "notes"],
      tech_stack: ["Go"],
      repo: "https://example.com/u/alpha",
      description: "Search-first tool",
    });
    project("Beta", { status: "Paused", category: "game", tags: ["ai"], tech_stack: ["Godot"] });
    project("Gamma", { status: "Active", category: "app", tags: ["notes"] });

    assert.deepEqual(listProjects(query({ status: "Paused" })).rows.map((r) => r.name), ["Beta"]);
    assert.deepEqual(listProjects(query({ category: "APP", sort: "name" })).rows.map((r) => r.name), ["Alpha", "Gamma"]);
    assert.deepEqual(listProjects(query({ tag: "ai", sort: "name" })).rows.map((r) => r.name), ["Alpha", "Beta"]);
    assert.deepEqual(listProjects(query({ tag: "AI" })).rows.length, 2, "tag match ignores case");
    assert.deepEqual(listProjects(query({ tech: "Godot" })).rows.map((r) => r.name), ["Beta"]);
    assert.deepEqual(listProjects(query({ repo: "yes" })).rows.map((r) => r.name), ["Alpha"]);
    assert.deepEqual(listProjects(query({ repo: "no", sort: "name" })).rows.map((r) => r.name), ["Beta", "Gamma"]);
    assert.deepEqual(listProjects(query({ q: "search" })).rows.map((r) => r.name), ["Alpha"]);
  });

  it("treats LIKE wildcards in search as plain text", () => {
    project("100% done");
    project("Plain");
    assert.deepEqual(listProjects(query({ q: "%" })).rows.map((r) => r.name), ["100% done"]);
    assert.equal(listProjects(query({ q: "_" })).total, 0);
  });

  it("sorts by name, status and open tasks", () => {
    const b = project("Bravo", { status: "Idea" });
    const a = project("Alpha", { status: "Shipped" });
    const c = project("Charlie", { status: "Active" });
    createTask(c, taskInput("one"));
    createTask(c, taskInput("two"));
    createTask(b, taskInput("three"));
    assert.deepEqual(listProjects(query({ sort: "name" })).rows.map((r) => r.name), ["Alpha", "Bravo", "Charlie"]);
    assert.deepEqual(listProjects(query({ sort: "status" })).rows.map((r) => r.name), ["Charlie", "Bravo", "Alpha"]);
    const byOpen = listProjects(query({ sort: "open" })).rows;
    assert.equal(byOpen[0].id, c);
    assert.equal(byOpen[0].open_tasks, 2);
    assert.ok(a > 0);
  });

  it("reports progress only from milestone rows and never invents a percentage", () => {
    const withoutMilestones = project("Empty");
    const withMilestones = project("Roadmap");
    const first = createMilestone(withMilestones, "Schema", null);
    createMilestone(withMilestones, "Launch", "2026-06-01");
    assert.ok(first);
    setMilestoneStatus(first!, withMilestones, "Done");

    const rows = listProjects(query({ sort: "name" })).rows;
    const empty = rows.find((r) => r.id === withoutMilestones)!;
    const roadmap = rows.find((r) => r.id === withMilestones)!;
    assert.equal(empty.milestone_total, 0);
    assert.equal(roadmap.milestone_done, 1);
    assert.equal(roadmap.milestone_total, 2);
    assert.equal(roadmap.next_milestone, "Launch");
    assert.equal(milestoneSummary(withoutMilestones).progress.percent, null);
    assert.equal(milestoneSummary(withMilestones).progress.percent, 50);
  });

  it("builds kanban columns with the real totals per status", () => {
    project("A", { status: "Active" });
    project("B", { status: "Active" });
    project("C", { status: "Idea" });
    const columns = listKanban(query({}));
    assert.deepEqual(
      columns.map((c) => [c.status, c.page.total]),
      [["Active", 2], ["Idea", 1], ["Paused", 0], ["Shipped", 0]],
    );
  });

  it("returns facets from stored values", () => {
    project("A", { category: "app", tags: ["x", "y"], tech_stack: ["Go"] });
    project("B", { category: "game", tags: ["y"] });
    const facets = libraryFacets();
    assert.deepEqual(facets.categories, ["app", "game"]);
    assert.deepEqual(facets.tags, ["x", "y"]);
    assert.deepEqual(facets.tech, ["Go"]);
  });

  it("counts AI sessions linked with the session_of relation and tolerates none", () => {
    const linked = project("Linked");
    project("Unlinked");
    getDb().prepare(
      "INSERT INTO record_links (from_type, from_id, to_type, to_id, relation) VALUES ('ai_session', 'sess-1', 'projects', ?, 'session_of')",
    ).run(String(linked));
    const rows = listProjects(query({ sort: "name" })).rows;
    assert.equal(rows.find((r) => r.id === linked)!.sessions, 1);
    assert.equal(rows.find((r) => r.name === "Unlinked")!.sessions, 0);
    const sessions = listLinkedSessions(linked);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].sessionId, "sess-1");
    assert.deepEqual(listLinkedSessions(999), []);
  });
});

describe("project tasks, roadmap, history", () => {
  let projectId = 0;

  beforeEach(() => {
    installTestDb();
    projectId = project("Tasks project", { status: "Active" });
  });
  afterEach(() => {
    closeTestDb();
  });

  it("creates backlog items linked by id and keeps the legacy name", () => {
    const taskId = createTask(projectId, taskInput("Write docs"));
    assert.ok(taskId);
    const saved = getDb().prepare("SELECT project, project_id FROM project_items WHERE id = ?").get(taskId!) as {
      project: string;
      project_id: number;
    };
    assert.equal(saved.project, "Tasks project");
    assert.equal(saved.project_id, projectId);
  });

  it("moves and deletes items only inside their own project", () => {
    const taskId = createTask(projectId, taskInput("Move me"))!;
    const other = project("Other");
    assert.equal(moveTask(taskId, other, "Done"), false);
    assert.equal(moveTask(taskId, projectId, "Done"), true);
    const { counts, progress } = taskProgress(listTasks(projectId));
    assert.equal(counts.Done, 1);
    assert.equal(progress.percent, 100);
  });

  it("shows no task progress when there are no tasks", () => {
    assert.equal(taskProgress(listTasks(projectId)).progress.percent, null);
  });

  it("orders and reorders milestones and stamps completion", () => {
    const a = createMilestone(projectId, "A", null)!;
    const b = createMilestone(projectId, "B", null)!;
    assert.equal(moveMilestone(b, projectId, -1), true);
    assert.deepEqual(listMilestones(projectId).map((m) => m.title), ["B", "A"]);
    assert.equal(moveMilestone(b, projectId, -1), false, "already first");
    setMilestoneStatus(a, projectId, "Done");
    const done = listMilestones(projectId).find((m) => m.id === a)!;
    assert.ok(done.completed_at);
    setMilestoneStatus(a, projectId, "Doing");
    assert.equal(listMilestones(projectId).find((m) => m.id === a)!.completed_at, null);
  });

  it("writes history only for real events: created, status, archive, milestone done", () => {
    updateProject(projectId, {
      name: "Tasks project",
      status: "Paused",
      category: null,
      repo: null,
      local_path: null,
      description: null,
      tags: [],
      tech_stack: [],
      milestone_date: null,
      notes: null,
    });
    setArchived(projectId, true);
    const milestone = createMilestone(projectId, "Launch", null)!;
    setMilestoneStatus(milestone, projectId, "Done");
    const kinds = listHistory(projectId).map((h) => h.kind).reverse();
    assert.deepEqual(kinds, ["created", "status", "archived", "milestone"]);
    assert.equal(listHistory(projectId).find((h) => h.kind === "milestone")?.detail, "Launch");
    assert.equal(recentActivity(projectId).length > 0, true);
  });

  it("renaming a project renames its backlog items", () => {
    const taskId = createTask(projectId, taskInput("Keep link"))!;
    updateProject(projectId, {
      name: "Renamed",
      status: "Active",
      category: null,
      repo: null,
      local_path: null,
      description: null,
      tags: [],
      tech_stack: [],
      milestone_date: null,
      notes: null,
    });
    const saved = getDb().prepare("SELECT project, project_id FROM project_items WHERE id = ?").get(taskId) as {
      project: string;
      project_id: number;
    };
    assert.equal(saved.project, "Renamed");
    assert.equal(saved.project_id, projectId);
  });

  it("links a session to a project in either direction", () => {
    addLink({
      from: { type: "projects", id: String(projectId) },
      to: { type: "ai_session", id: "sess-2" },
      relation: "session_of",
    });
    assert.equal(listLinkedSessions(projectId).length, 1);
  });
});

function taskInput(title: string) {
  return {
    title,
    kind: "Feature" as const,
    priority: "Medium" as const,
    status: "Backlog" as const,
    due_date: null,
    description: null,
  };
}
