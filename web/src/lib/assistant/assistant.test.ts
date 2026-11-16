import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { setConsent } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { closeTestDb, installTestDb } from "@/lib/testing/test-db";
import { executeAction, undoAction } from "./execute";
import { converse } from "./plan";
import { actionSchema, planSchema, validPlan } from "./registry";
import { applyAction, messagesForDay, setAutoApply, undoApplied } from "./store";
import { nowLabel } from "./context";

beforeEach(() => installTestDb());
afterEach(() => closeTestDb());

const reply = (data: unknown) => (async () => ({ ok: true as const, data, model: "m", usage: { promptTokens: 1, completionTokens: 1 } })) as never;
const count = (table: string) => Number((getDb().prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n);

describe("executeAction", () => {
  it("creates a task, matching select options case-insensitively", () => {
    const r = executeAction(getDb(), { type: "create_record", entity: "tasks", fields: { title: "Revise optics", due: "2026-11-17", priority: "high" } });
    assert.equal(r.ok, true);
    const row = getDb().prepare("SELECT priority, status FROM tasks").get() as { priority: string; status: string };
    assert.equal(row.priority, "High");
    assert.equal(row.status, "To do");
  });

  it("rejects unknown fields, bad dates and missing required fields", () => {
    const db = getDb();
    assert.equal(executeAction(db, { type: "create_record", entity: "tasks", fields: { title: "x", hax: "y" } }).ok, false);
    assert.equal(executeAction(db, { type: "create_record", entity: "tasks", fields: { title: "x", due: "next friday" } }).ok, false);
    assert.equal(executeAction(db, { type: "create_record", entity: "tasks", fields: { due: "2026-11-17" } }).ok, false);
    assert.equal(count("tasks"), 0);
  });

  it("refuses entities off the allow-list at the schema level", () => {
    assert.equal(actionSchema.safeParse({ type: "create_record", entity: "documents", fields: {} }).success, false);
    assert.equal(actionSchema.safeParse({ type: "create_record", entity: "sqlite_master", fields: {} }).success, false);
  });

  it("updates and undoes, restoring the previous value", () => {
    const db = getDb();
    const made = executeAction(db, { type: "create_record", entity: "tasks", fields: { title: "Read" } });
    assert.ok(made.ok);
    const id = (made.undo as { id: number }).id;
    const up = executeAction(db, { type: "update_record", entity: "tasks", id, fields: { status: "Done" } });
    assert.ok(up.ok);
    assert.equal((db.prepare("SELECT status FROM tasks WHERE id = ?").get(id) as { status: string }).status, "Done");
    if (up.ok) undoAction(db, up.undo);
    assert.equal((db.prepare("SELECT status FROM tasks WHERE id = ?").get(id) as { status: string }).status, "To do");
  });

  it("deletes and restores the full row on undo", () => {
    const db = getDb();
    const made = executeAction(db, { type: "create_record", entity: "notes", fields: { title: "Keep me", body: "text" } });
    assert.ok(made.ok);
    const id = (made.undo as { id: number }).id;
    const del = executeAction(db, { type: "delete_record", entity: "notes", id });
    assert.ok(del.ok);
    assert.equal(count("notes"), 0);
    if (del.ok) assert.equal(undoAction(db, del.undo).ok, true);
    assert.equal((db.prepare("SELECT body FROM notes WHERE id = ?").get(id) as { body: string }).body, "text");
  });

  it("logs weight", () => {
    assert.equal(executeAction(getDb(), { type: "log_weight", weight_kg: 72.5, date: "2026-11-16" }).ok, true);
    assert.equal(count("body_measurements"), 1);
  });
});

describe("converse", () => {
  it("does nothing and calls nothing without consent", async () => {
    let called = false;
    const r = await converse(getDb(), "add a task", (async () => { called = true; throw new Error("no"); }) as never);
    assert.equal(r.ok, false);
    assert.equal(called, false);
    assert.equal(count("tasks"), 0);
  });

  it("auto-applies adds, holds deletes for confirmation", async () => {
    const db = getDb();
    setConsent(db, "assistant", true);
    const victim = executeAction(db, { type: "create_record", entity: "notes", fields: { title: "Old note" } });
    assert.ok(victim.ok);
    const noteId = (victim.undo as { id: number }).id;
    const r = await converse(db, "plan my day and delete the old note", reply({
      reply: "Done.",
      actions: [
        { type: "create_record", entity: "tasks", fields: { title: "Study physics", due: nowLabel().date } },
        { type: "delete_record", entity: "notes", id: noteId },
      ],
    }));
    assert.ok(r.ok);
    if (r.ok) { assert.equal(r.applied, 1); assert.equal(r.pending, 1); }
    assert.equal(count("tasks"), 1);
    assert.equal(count("notes"), 1, "delete waits for a click");
    const pending = messagesForDay(db, nowLabel().date).flatMap((m) => m.actions).find((a) => a.status === "pending");
    assert.ok(pending);
    assert.equal(applyAction(db, pending.id).ok, true);
    assert.equal(count("notes"), 0);
    assert.equal(undoApplied(db, pending.id).ok, true);
    assert.equal(count("notes"), 1);
  });

  it("keeps everything pending when auto-apply is off", async () => {
    const db = getDb();
    setConsent(db, "assistant", true);
    setAutoApply(db, false);
    await converse(db, "add a task", reply({ reply: "ok", actions: [{ type: "create_record", entity: "tasks", fields: { title: "A" } }] }));
    assert.equal(count("tasks"), 0);
  });

  it("drops invalid actions but keeps the valid ones and the reply", () => {
    const plan = validPlan(planSchema.parse({ reply: "x", actions: [{ type: "drop_table" }, { type: "log_weight", weight_kg: 70 }] }));
    assert.equal(plan.actions.length, 1);
    assert.equal(plan.dropped, 1);
  });

  it("rejects a reply that leaked action syntax", () => {
    assert.equal(planSchema.safeParse({ reply: "Done.',\"actions\":[] Oops invalid JSON", actions: [] }).success, false);
    assert.equal(planSchema.safeParse({ reply: "Moved gym to 7 PM.", actions: [] }).success, true);
  });

  it("retries once when the reply is unreadable", async () => {
    const db = getDb();
    setConsent(db, "assistant", true);
    let calls = 0;
    const r = await converse(db, "hi", (async () => {
      calls += 1;
      return calls === 1
        ? { ok: false as const, code: "invalid_output" as const, message: "bad" }
        : { ok: true as const, data: { reply: "hello", actions: [] }, model: "m", usage: { promptTokens: 1, completionTokens: 1 } };
    }) as never);
    assert.equal(calls, 2);
    assert.equal(r.ok, true);
  });

  it("an unknown optional select value falls back to the default", () => {
    const r = executeAction(getDb(), { type: "create_record", entity: "tasks", fields: { title: "x", area: "Nonsense" } });
    assert.equal(r.ok, true);
  });

  it("a failing action does not block the others", async () => {
    const db = getDb();
    setConsent(db, "assistant", true);
    await converse(db, "x", reply({ reply: "ok", actions: [
      { type: "create_record", entity: "tasks", fields: { title: "Good" } },
      { type: "create_record", entity: "tasks", fields: { due: "bad-date", title: "Bad" } },
    ] }));
    assert.equal(count("tasks"), 1);
  });
});
