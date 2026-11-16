import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { getDb } from "../db";
import { insertRow, listRows } from "../crud";
import { listLinks } from "../links";
import { closeTestDb, installTestDb } from "../testing/test-db";
import { captureIdea, saveIdea } from "./repo";
import { convertIdeaToProject, projectValues, type ConvertRequest } from "./convert";
import { getIdea } from "./queries";
import { ideaSchema } from "./schema";

const baseRequest = (ideaId: number, overrides: Partial<ConvertRequest> = {}): ConvertRequest => ({
  ideaId,
  name: "Garden Planner",
  notes: "Plan beds and watering.",
  repo: "https://github.example/garden",
  status: "Idea",
  milestone: null,
  markBuilding: false,
  linkExistingProjectId: null,
  ...overrides,
});

function makeIdea(title = "Garden planner"): number {
  return captureIdea(title);
}

const projectRows = () => listRows("projects");

describe("idea to project conversion", () => {
  beforeEach(() => {
    installTestDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("creates one project from the approved fields and links the idea to it", () => {
    const idea = makeIdea();
    const before = projectRows().length;

    const result = convertIdeaToProject(baseRequest(idea));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.created, true);
    assert.equal(projectRows().length, before + 1);

    const project = listRows("projects").find((row) => row.id === result.projectId);
    assert.ok(project);
    assert.equal(project.name, "Garden Planner");
    assert.equal(project.notes, "Plan beds and watering.");
    assert.equal(project.repo, "https://github.example/garden");
    assert.equal(project.status, "Idea");
    assert.equal(project.archived, 0, "NOT NULL boolean gets its default");
    assert.equal(project.pinned, 0);

    const linked = getIdea(idea);
    assert.equal(linked?.project_id, result.projectId);
    assert.equal(linked?.project_name, "Garden Planner");
    assert.equal(linked?.status, "Inbox", "status is kept unless the user ticks Building");
  });

  it("records a converted_to link from the idea to the project", () => {
    const idea = makeIdea();
    const result = convertIdeaToProject(baseRequest(idea));
    assert.ok(result.ok);
    const links = listLinks("ideas", idea);
    assert.equal(links.length, 1);
    assert.equal(links[0].relation, "converted_to");
    assert.equal(links[0].type, "projects");
    assert.equal(links[0].recordId, String(result.projectId));
  });

  it("sets status Building when the user ticks it", () => {
    const idea = makeIdea();
    convertIdeaToProject(baseRequest(idea, { markBuilding: true }));
    assert.equal(getIdea(idea)?.status, "Building");
  });

  it("never deletes the idea", () => {
    const idea = makeIdea();
    convertIdeaToProject(baseRequest(idea));
    assert.ok(getIdea(idea), "idea still exists");
  });

  it("is idempotent: converting again returns the same project and creates nothing", () => {
    const idea = makeIdea();
    const first = convertIdeaToProject(baseRequest(idea));
    assert.ok(first.ok);
    const count = projectRows().length;
    const links = listLinks("ideas", idea).length;

    const second = convertIdeaToProject(baseRequest(idea, { name: "Something else" }));

    assert.deepEqual(second, { ok: true, projectId: first.projectId, created: false });
    assert.equal(projectRows().length, count, "no second project");
    assert.equal(listLinks("ideas", idea).length, links, "no second link");
  });

  it("refuses a duplicate name and reports the existing project instead of creating one", () => {
    const existing = insertRow("projects", projectValues({ name: "garden planner", status: "Active" }));
    const idea = makeIdea();
    const count = projectRows().length;

    const result = convertIdeaToProject(baseRequest(idea, { name: "  Garden Planner " }));

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.duplicate?.id, existing);
    assert.equal(result.duplicate?.name, "garden planner");
    assert.equal(projectRows().length, count, "no project created");
    assert.equal(getIdea(idea)?.project_id, null, "idea untouched");
    assert.equal(listLinks("ideas", idea).length, 0);
  });

  it("links to the existing project the user picked, without creating a row", () => {
    const existing = insertRow("projects", projectValues({ name: "Garden Planner", status: "Active" }));
    const idea = makeIdea();
    const count = projectRows().length;

    const result = convertIdeaToProject(baseRequest(idea, { linkExistingProjectId: existing }));

    assert.deepEqual(result, { ok: true, projectId: existing, created: false });
    assert.equal(projectRows().length, count);
    assert.equal(getIdea(idea)?.project_id, existing);
  });

  it("refuses to link to a project that does not exist, and changes nothing", () => {
    const idea = makeIdea();
    const count = projectRows().length;
    const result = convertIdeaToProject(baseRequest(idea, { linkExistingProjectId: 999_999 }));
    assert.equal(result.ok, false);
    assert.equal(projectRows().length, count);
    assert.equal(getIdea(idea)?.project_id, null);
  });

  it("treats a stale project_id (project deleted) as unconverted and converts again", () => {
    const idea = makeIdea();
    const first = convertIdeaToProject(baseRequest(idea));
    assert.ok(first.ok);
    getDb().prepare("DELETE FROM projects WHERE id = ?").run(first.ok ? first.projectId : 0);

    const again = convertIdeaToProject(baseRequest(idea, { name: "Garden Planner v2" }));

    assert.ok(again.ok);
    assert.equal(again.ok && again.created, true);
    assert.equal(getIdea(idea)?.project_id, again.ok ? again.projectId : null);
  });

  it("returns an error for an unknown idea", () => {
    const result = convertIdeaToProject(baseRequest(424_242));
    assert.equal(result.ok, false);
  });

  it("refuses an unknown project status before writing anything", () => {
    const idea = makeIdea();
    const count = projectRows().length;
    const result = convertIdeaToProject(baseRequest(idea, { status: "Not a status" }));
    assert.deepEqual(result, { ok: false, error: "Choose a project status from the list." });
    assert.equal(projectRows().length, count);
    assert.equal(getIdea(idea)?.project_id, null);
  });

  it("validates the approved fields before any write (empty name, bad repo, unknown status)", async () => {
    const { conversionSchema } = await import("./schema");
    assert.equal(conversionSchema.safeParse({ name: "  ", notes: "", repo: "", status: "Idea", milestone: "", markBuilding: false }).success, false);
    assert.equal(
      conversionSchema.safeParse({ name: "X", notes: "", repo: "javascript:alert(1)", status: "Idea", milestone: "", markBuilding: false }).success,
      false,
    );
    assert.equal(
      conversionSchema.safeParse({ name: "X", notes: "", repo: "", status: "Bogus", milestone: "", markBuilding: false }).success,
      false,
    );
    const ok = conversionSchema.parse({ name: " X ", notes: "", repo: "", status: "Idea", milestone: "", markBuilding: true });
    assert.equal(ok.name, "X");
    assert.equal(ok.repo, null);
    assert.equal(ok.notes, null);
  });

  it("keeps a saved idea edit intact when conversion happens afterwards", () => {
    const idea = makeIdea("Keep me");
    const edited = ideaSchema.parse({
      title: "Keep me", body: "Body", category: "Software", status: "Exploring", priority: "High",
      tags: "a, b", research_links: "", attachments: "", notes: "",
    });
    assert.equal(saveIdea(idea, edited), true);
    convertIdeaToProject(baseRequest(idea));
    const detail = getIdea(idea);
    assert.equal(detail?.body, "Body");
    assert.equal(detail?.status, "Exploring");
  });
});
