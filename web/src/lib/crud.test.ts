import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { deleteRow, insertRow, listRows, searchAll, updateField } from "./crud";
import { closeTestDb, installTestDb } from "./testing/test-db";

describe("crud", () => {
  beforeEach(() => {
    installTestDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("inserts, lists, updates and deletes rows, newest first where ordered by id", () => {
    const first = insertRow("screen_logs", {
      date: "2026-11-14",
      category: "Study",
      minutes: 30,
      note: "first",
    });
    const second = insertRow("screen_logs", {
      date: "2026-11-15",
      category: "Coding",
      minutes: 45,
      note: "second",
    });

    const rows = listRows("screen_logs");
    assert.deepEqual(rows.map((row) => row.id), [second, first]);

    updateField("screen_logs", first, "minutes", 60);
    const updated = listRows("screen_logs", { filter: { category: "Study" } });
    assert.equal(updated[0].minutes, 60);

    deleteRow("screen_logs", first);
    assert.equal(listRows("screen_logs").length, 1);
  });

  it("refuses unknown columns in filters and updates", () => {
    assert.throws(() => listRows("tasks", { filter: { nope: "x" } }), /Unknown column/);
    const id = insertRow("tasks", { title: "x", status: "To do" });
    assert.throws(() => updateField("tasks", id, "password", "x"), /Unknown column/);
  });

  it("finds records by text and links each hit to its row anchor", () => {
    const id = insertRow("focus_sessions", {
      date: "2026-11-15",
      label: "Quarterly zebra review",
      minutes: 40,
      distractions: 0,
    });

    const hits = searchAll("zebra");
    const hit = hits.find((candidate) => candidate.entity === "focus_sessions");
    assert.ok(hit, "focus session is found");
    assert.equal(hit.id, id);
    assert.equal(hit.title, "Quarterly zebra review");
    assert.equal(hit.pageHref, "/focus");
    assert.equal(hit.href, `/focus#focus_sessions-${id}`);
  });

  it("ignores queries shorter than two characters and escapes LIKE wildcards", () => {
    assert.deepEqual(searchAll("a"), []);
    insertRow("focus_sessions", { date: "2026-11-15", label: "100% done", minutes: 5, distractions: 0 });
    insertRow("focus_sessions", { date: "2026-11-15", label: "1000 done", minutes: 5, distractions: 0 });
    const titles = searchAll("100%").map((hit) => hit.title);
    assert.deepEqual(titles, ["100% done"]);
  });
});
