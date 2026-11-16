import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { searchAll } from "../crud";
import { closeTestDb, installTestDb } from "../testing/test-db";
import { captureIdea, deleteIdea, saveIdea, setIdeaFlag, setIdeaStatus } from "./repo";
import { boardColumns, getIdea, ideaTags, listIdeas, statusCounts } from "./queries";
import { ideaSchema } from "./schema";
import { parseIdeaParams } from "./filters";
import { listLinks, addLink } from "../links";
import { insertRow } from "../crud";
import { projectValues } from "./convert";

const input = (overrides: Record<string, unknown> = {}) =>
  ideaSchema.parse({
    title: "Idea", body: "A body about kestrels", category: "Robotics", status: "Planned",
    priority: "Medium", tags: "birds, drones", research_links: "https://a.example/paper",
    attachments: "sketch.png", notes: "private note", ...overrides,
  });

describe("idea repository and queries", () => {
  beforeEach(() => {
    installTestDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("captures an Inbox idea with defaults and finds it through search", () => {
    const id = captureIdea("Solar kettle");
    const idea = getIdea(id);
    assert.equal(idea?.status, "Inbox");
    assert.equal(idea?.category, "Random");
    assert.equal(idea?.pinned, 0);
    assert.equal(idea?.archived, 0);
    assert.ok(searchAll("kettle").some((hit) => hit.entity === "ideas" && hit.href === `/ideas/${id}`));
  });

  it("saves edits, moves status, toggles flags, and bumps updated_at", () => {
    const id = captureIdea("Edit me");
    assert.equal(saveIdea(id, input({ title: "Edited" })), true);
    assert.equal(getIdea(id)?.title, "Edited");
    assert.equal(getIdea(id)?.tags, "birds, drones");
    assert.equal(setIdeaStatus(id, "Shelved"), true);
    assert.equal(getIdea(id)?.status, "Shelved");
    assert.equal(setIdeaFlag(id, "pinned", true), true);
    assert.equal(setIdeaFlag(id, "archived", true), true);
    assert.equal(getIdea(id)?.archived, 1);
    assert.equal(saveIdea(999_999, input()), false, "unknown id changes nothing");
  });

  it("deletes an idea and its links, and leaves linked records alone", () => {
    const id = captureIdea("Gone soon");
    const project = insertRow("projects", projectValues({ name: "Keeps going" }));
    addLink({ from: { type: "ideas", id: String(id) }, to: { type: "projects", id: String(project) }, relation: "related" });
    deleteIdea(id);
    assert.equal(getIdea(id), undefined);
    assert.equal(listLinks("projects", project).length, 0);
    assert.ok(getDb().prepare("SELECT id FROM projects WHERE id = ?").get(project), "project kept");
  });

  it("hides archived ideas by default and shows them under the archived filter", () => {
    const live = captureIdea("Live one");
    const archived = captureIdea("Archived one");
    setIdeaFlag(archived, "archived", true);
    const active = listIdeas(parseIdeaParams({}).filters, 1).rows.map((row) => row.id);
    assert.deepEqual(active, [live]);
    const only = listIdeas(parseIdeaParams({ archived: "archived" }).filters, 1).rows.map((row) => row.id);
    assert.deepEqual(only, [archived]);
    const all = listIdeas(parseIdeaParams({ archived: "all" }).filters, 1).rows.length;
    assert.equal(all, 2);
  });

  it("filters by status, category, exact tag and pinned, combined", () => {
    const a = captureIdea("Alpha");
    const b = captureIdea("Beta");
    const c = captureIdea("Gamma");
    saveIdea(a, input({ title: "Alpha", category: "AI", status: "Exploring", tags: "llm, search" }));
    saveIdea(b, input({ title: "Beta", category: "AI", status: "Planned", tags: "llm-tools" }));
    saveIdea(c, input({ title: "Gamma", category: "Games", status: "Exploring", tags: "search" }));
    setIdeaFlag(c, "pinned", true);

    const pick = (query: Record<string, string>) =>
      listIdeas(parseIdeaParams(query).filters, 1).rows.map((row) => row.title).sort();

    assert.deepEqual(pick({ status: "Exploring" }), ["Alpha", "Gamma"]);
    assert.deepEqual(pick({ category: "AI" }), ["Alpha", "Beta"]);
    assert.deepEqual(pick({ tag: "llm" }), ["Alpha"], "exact tag, not a prefix of llm-tools");
    assert.deepEqual(pick({ tag: "search" }), ["Alpha", "Gamma"]);
    assert.deepEqual(pick({ pinned: "1" }), ["Gamma"]);
    assert.deepEqual(pick({ status: "Exploring", category: "AI", tag: "search" }), ["Alpha"]);
    assert.deepEqual(pick({ q: "100%" }), [], "wildcard characters match literally");
  });

  it("treats LIKE wildcards in the search box as plain characters", () => {
    captureIdea("100% pure");
    captureIdea("1000 pure");
    const titles = listIdeas(parseIdeaParams({ q: "100%" }).filters, 1).rows.map((row) => row.title);
    assert.deepEqual(titles, ["100% pure"]);
  });

  it("pages results on the server with a clamped page number", () => {
    for (let i = 0; i < 30; i++) captureIdea(`Paged ${String(i).padStart(2, "0")}`);
    const filters = parseIdeaParams({}).filters;
    const first = listIdeas(filters, 1, 24);
    assert.equal(first.rows.length, 24);
    assert.equal(first.page.total, 30);
    assert.equal(first.page.totalPages, 2);
    const second = listIdeas(filters, 2, 24);
    assert.equal(second.rows.length, 6);
    const beyond = listIdeas(filters, 99, 24);
    assert.equal(beyond.page.page, 2, "page clamps to the last page");
    assert.equal(listIdeas(filters, 0, 24).page.page, 1);
  });

  it("returns board columns in status order with true totals", () => {
    const ids = [captureIdea("One"), captureIdea("Two"), captureIdea("Three")];
    setIdeaStatus(ids[1], "Building");
    setIdeaStatus(ids[2], "Building");
    const columns = boardColumns(parseIdeaParams({}).filters, 1);
    assert.deepEqual(columns.map((column) => column.status), ["Inbox", "Exploring", "Planned", "Building", "Completed", "Shelved"]);
    const building = columns.find((column) => column.status === "Building");
    assert.equal(building?.total, 2);
    assert.equal(building?.rows.length, 1, "column rows are capped");
    assert.equal(columns.find((column) => column.status === "Inbox")?.total, 1);
  });

  it("counts active ideas per status and archived ideas separately", () => {
    captureIdea("A");
    const b = captureIdea("B");
    setIdeaStatus(b, "Planned");
    const archived = captureIdea("C");
    setIdeaFlag(archived, "archived", true);
    const counts = statusCounts();
    assert.equal(counts.Inbox, 1);
    assert.equal(counts.Planned, 1);
    assert.equal(counts.archived, 1);
  });

  it("lists distinct tags by use", () => {
    const a = captureIdea("T1");
    const b = captureIdea("T2");
    saveIdea(a, input({ title: "T1", tags: "ai, robots" }));
    saveIdea(b, input({ title: "T2", tags: "ai" }));
    assert.deepEqual(ideaTags()[0], { tag: "ai", count: 2 });
  });

  it("reports a project link as absent when the project row was deleted", () => {
    const id = captureIdea("Linked");
    const project = insertRow("projects", projectValues({ name: "Temp" }));
    getDb().prepare("UPDATE ideas SET project_id = ? WHERE id = ?").run(project, id);
    assert.equal(getIdea(id)?.project_name, "Temp");
    getDb().prepare("DELETE FROM projects WHERE id = ?").run(project);
    assert.equal(getIdea(id)?.project_id, null);
  });
});
