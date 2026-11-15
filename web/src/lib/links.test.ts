import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { deleteRow, insertRow, listRows } from "./crud";
import { addLink, backlinks, listLinks, removeLink } from "./links";
import { closeTestDb, installTestDb } from "./testing/test-db";

function makeTask(title: string): number {
  return insertRow("tasks", { title, status: "To do", priority: "Medium", due: null, area: null });
}

function makeFocus(label: string): number {
  return insertRow("focus_sessions", {
    date: "2026-11-15",
    label,
    minutes: 25,
    distractions: 0,
    notes: null,
  });
}

describe("links", () => {
  beforeEach(() => {
    installTestDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("links two records and shows the link from both ends", () => {
    const task = makeTask("Revise optics");
    const focus = makeFocus("Optics block");

    const result = addLink({
      from: { type: "tasks", id: String(task) },
      to: { type: "focus_sessions", id: String(focus) },
      relation: "supports",
      note: "  for the mock test  ",
    });
    assert.deepEqual(result, { ok: true, created: true });

    const fromTask = listLinks("tasks", task);
    assert.equal(fromTask.length, 1);
    assert.equal(fromTask[0].direction, "out");
    assert.equal(fromTask[0].relation, "supports");
    assert.equal(fromTask[0].title, "Optics block");
    assert.equal(fromTask[0].note, "for the mock test");
    assert.equal(fromTask[0].href, `/focus#focus_sessions-${focus}`);

    const fromFocus = listLinks("focus_sessions", focus);
    assert.equal(fromFocus.length, 1);
    assert.equal(fromFocus[0].direction, "in");
    assert.equal(fromFocus[0].title, "Revise optics");
    assert.deepEqual(
      backlinks("focus_sessions", focus).map((link) => link.recordId),
      [String(task)],
    );
    assert.deepEqual(backlinks("tasks", task), []);
  });

  it("ignores an identical link added twice", () => {
    const task = makeTask("A");
    const focus = makeFocus("B");
    const input = {
      from: { type: "tasks", id: String(task) },
      to: { type: "focus_sessions", id: String(focus) },
    };
    assert.deepEqual(addLink(input), { ok: true, created: true });
    assert.deepEqual(addLink(input), { ok: true, created: false });
    assert.equal(listLinks("tasks", task).length, 1);
  });

  it("rejects unknown link types, bad relations, self links and missing records", () => {
    const task = makeTask("C");
    const base = { from: { type: "tasks", id: String(task) } };

    assert.equal(
      addLink({ ...base, to: { type: "not_a_type", id: "1" } }).ok,
      false,
    );
    assert.equal(
      addLink({ ...base, to: { type: "focus_sessions", id: "1" }, relation: "owns" }).ok,
      false,
    );
    assert.deepEqual(
      addLink({ ...base, to: { type: "tasks", id: String(task) } }),
      { ok: false, error: "A record cannot link to itself." },
    );
    assert.deepEqual(
      addLink({ ...base, to: { type: "focus_sessions", id: "999999" } }),
      { ok: false, error: "Record not found." },
    );
    assert.deepEqual(
      addLink({ ...base, to: { type: "focus_sessions", id: "1; DROP TABLE tasks" } }),
      { ok: false, error: "Invalid record id." },
    );
  });

  it("links to kinds that have no table, by their raw id", () => {
    const task = makeTask("D");
    const result = addLink({
      from: { type: "tasks", id: String(task) },
      to: { type: "ai_session", id: "session-2026-11-15-abc" },
      relation: "source",
    });
    assert.deepEqual(result, { ok: true, created: true });
    const [link] = listLinks("tasks", task);
    assert.equal(link.typeLabel, "AI session");
    assert.equal(link.title, "session-2026-11-15-abc");
    assert.equal(link.href, null);
  });

  it("removes one link by id and leaves the records alone", () => {
    const task = makeTask("E");
    const focus = makeFocus("F");
    addLink({
      from: { type: "tasks", id: String(task) },
      to: { type: "focus_sessions", id: String(focus) },
    });
    const [link] = listLinks("tasks", task);

    assert.equal(removeLink(link.id), true);
    assert.equal(removeLink(link.id), false);
    assert.deepEqual(listLinks("tasks", task), []);
    assert.equal(listRows("tasks").length, 1);
    assert.equal(listRows("focus_sessions").length, 1);
  });

  it("drops a record's links when it is deleted, without touching other records", () => {
    const task = makeTask("G");
    const other = makeTask("H");
    const focus = makeFocus("I");
    addLink({
      from: { type: "tasks", id: String(task) },
      to: { type: "focus_sessions", id: String(focus) },
    });
    addLink({
      from: { type: "tasks", id: String(other) },
      to: { type: "focus_sessions", id: String(focus) },
    });

    deleteRow("tasks", task);

    assert.deepEqual(
      listLinks("focus_sessions", focus).map((link) => link.title),
      ["H"],
    );
    assert.equal(listRows("tasks").length, 1);
    assert.equal(listRows("focus_sessions").length, 1);
  });
});
