import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { milestoneProgress, progressOf } from "./progress";
import { parseLibraryParams, libraryQueryString, pageCount } from "./filters";

describe("progress", () => {
  it("reports no percentage when there is nothing to measure", () => {
    const result = progressOf(0, 0);
    assert.equal(result.percent, null);
    assert.equal(result.label, "No milestones");
  });

  it("computes done over total and rounds to a whole percent", () => {
    assert.deepEqual(progressOf(1, 3).percent, 33);
    assert.equal(progressOf(3, 3).percent, 100);
    assert.equal(progressOf(0, 4).label, "0 of 4 done");
  });

  it("uses only milestone rows, returns the first unfinished one as next", () => {
    const result = milestoneProgress([
      { title: "Schema", status: "Done" },
      { title: "UI", status: "Doing" },
      { title: "Launch", status: "Planned" },
    ]);
    assert.equal(result.progress.percent, 33);
    assert.equal(result.next?.title, "UI");
  });

  it("returns no next milestone and no percentage with no milestones", () => {
    const result = milestoneProgress([]);
    assert.equal(result.progress.percent, null);
    assert.equal(result.next, null);
  });
});

describe("library query params", () => {
  it("falls back to safe defaults for unknown values", () => {
    const query = parseLibraryParams({ view: "pie", status: "Nope", sort: "random", page: "-4" });
    assert.equal(query.view, "grid");
    assert.equal(query.status, null);
    assert.equal(query.sort, "activity");
    assert.equal(query.page, 1);
    assert.equal(query.archived, "hide");
  });

  it("keeps whitelisted values and strips control characters from text", () => {
    const query = parseLibraryParams({
      view: "kanban",
      status: "Paused",
      q: "  tab\u0007le   tap ",
      page: "3",
    });
    assert.equal(query.view, "kanban");
    assert.equal(query.status, "Paused");
    assert.equal(query.q, "tab le tap");
    assert.equal(query.page, 3);
  });

  it("round-trips through a query string without defaults", () => {
    const query = parseLibraryParams({ status: "Active", tag: "ai", page: "2" });
    assert.equal(libraryQueryString({ ...query }), "?status=Active&tag=ai&page=2");
    assert.equal(libraryQueryString(parseLibraryParams({})), "");
  });

  it("counts pages with a minimum of one", () => {
    assert.equal(pageCount(0), 1);
    assert.equal(pageCount(24), 1);
    assert.equal(pageCount(25), 2);
  });
});
