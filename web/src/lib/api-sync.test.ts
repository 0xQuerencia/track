import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { listRows } from "./crud";
import { applyOps, pullSnapshot, todaySnapshot } from "./api-sync";
import { closeTestDb, installTestDb } from "./testing/test-db";

/*
 * The phone sync API (/api/v1/*) is a thin layer over these functions. The
 * tests call them directly; bearer-token auth lives in api-auth.ts.
 */

const opId = (name: string) => `test-op-${name}-0001`;

describe("api sync core", () => {
  beforeEach(() => {
    installTestDb();
  });
  afterEach(() => {
    closeTestDb();
  });

  it("creates a task from a queued op and reports the new id", () => {
    const [result] = applyOps([
      { opId: opId("create"), op: "create", entity: "tasks", values: { title: "Phone task", status: "To do", priority: "High" } },
    ]) as { ok: boolean; id?: number }[];
    assert.equal(result.ok, true);
    assert.ok(result.id && result.id > 0);
    const titles = listRows("tasks").map((row) => row.title);
    assert.ok(titles.includes("Phone task"));
  });

  it("applies a retried op only once, so a timed-out request cannot double-create", () => {
    const op = {
      opId: opId("retry"),
      op: "create",
      entity: "tasks",
      values: { title: "Retried", status: "To do", priority: "Low" },
    };
    const original = applyOps([op]) as { ok: boolean; id?: number }[];
    const replay = applyOps([op]) as { ok: boolean; id?: number }[];
    assert.equal(replay[0].ok, true);
    assert.ok(original[0].id && original[0].id > 0);
    assert.deepEqual(replay, original);
    const count = listRows("tasks").filter((row) => row.title === "Retried").length;
    assert.equal(count, 1);
  });

  it("refuses entities and fields the phone may not change", () => {
    const [denied] = applyOps([
      { opId: opId("denied"), op: "create", entity: "transactions", values: {} },
    ]) as { ok: boolean; error?: string }[];
    assert.deepEqual(denied, { opId: opId("denied"), ok: false, error: "Not allowed." });

    const id = (applyOps([
      { opId: opId("seed"), op: "create", entity: "tasks", values: { title: "Locked", status: "To do", priority: "Low" } },
    ]) as { id: number }[])[0].id;
    const [badField] = applyOps([
      { opId: opId("field"), op: "set", entity: "tasks", id, field: "created_at", value: "x" },
    ]) as { ok: boolean }[];
    assert.equal(badField.ok, false);
  });

  it("rejects temporary row IDs and applies and acknowledges a canonical delete once", () => {
    const [created] = applyOps([
      { opId: opId("canonical"), op: "create", entity: "tasks", values: { title: "Temporary identity", status: "To do", priority: "High" } },
    ]) as { id: number }[];
    const temporaryEdit = { opId: opId("temp-edit"), op: "set", entity: "tasks", id: -1, field: "status", value: "Done" };
    assert.deepEqual(applyOps([temporaryEdit]), [{ opId: temporaryEdit.opId, ok: false, error: "Bad target." }]);
    assert.equal(listRows("tasks").find(row => row.id === created.id)?.status, "To do");

    const clear = { opId: opId("canonical-delete"), op: "delete", entity: "tasks", id: created.id };
    const committed = [{ opId: clear.opId, ok: true, id: created.id }];
    assert.deepEqual(applyOps([clear]), committed);
    assert.deepEqual(applyOps([clear]), committed);
    assert.equal(listRows("tasks").some(row => row.id === created.id), false);
  });

  it("rejects a non-list body and an oversized batch", () => {
    assert.deepEqual(applyOps("nope"), { error: "ops must be a list." });
    const tooMany = Array.from({ length: 201 }, () => ({ opId: opId("many"), op: "habit" }));
    assert.deepEqual(applyOps(tooMany), { error: "At most 200 ops per request." });
  });

  it("builds the today snapshot and the pull cache with the expected shape", () => {
    const today = todaySnapshot();
    assert.ok(typeof today.date === "string");
    assert.ok(typeof today.tasks.open === "number");
    assert.ok(Array.isArray(today.tasks.top));

    const pull = pullSnapshot();
    assert.ok(Array.isArray(pull.data.tasks));
    assert.ok(Array.isArray(pull.data.chapters));
    assert.ok(Array.isArray(pull.data.habitLogs));
    assert.ok(Array.isArray(pull.insights.focus));
  });
});
