import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createToken } from "@/lib/security/integration-tokens";
import { runMigrations } from "@/lib/migrations";
import { useAsAppDb } from "@/lib/sessions/test-support";
import { recentCompletedSessions, unassignedSeconds } from "@/lib/study-nanny/sessions";
import { POST } from "./route";

const summary = {
  version: 1, session_id: 7,
  started_at: "2026-11-26T11:00:00Z", ended_at: "2026-11-26T11:25:00Z",
  wall_seconds: 1500, elapsed_seconds: 1430, focus_seconds: 1080,
  distraction_seconds: 180, idle_seconds: 20, break_seconds: 120,
};

test("scoped summary ingestion is idempotent, strict, and separate from Track timer logs", async () => {
  const db = new DatabaseSync(":memory:");
  runMigrations(db);
  useAsAppDb(db);
  const write = createToken(db, "Nanny", ["study-nanny:write"]);
  const wrong = createToken(db, "Other", ["metadata:write"]);
  const send = (data: unknown, token?: string) => POST(new Request("http://track.test/api/integrations/study-nanny", {
    method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(data),
  }));
  try {
    assert.equal((await send(summary)).status, 401);
    assert.equal((await send(summary, wrong.token)).status, 403);
    assert.equal((await send({ ...summary, screen: "must not persist" }, write.token)).status, 400);
    assert.equal((await send({ ...summary, focus_seconds: 1800 }, write.token)).status, 400);
    assert.equal((await send({ ...summary, ended_at: null }, write.token)).status, 400);
    assert.deepEqual(await (await send(summary, write.token)).json(), { ok: true, inserted: true });
    assert.deepEqual(await (await send(summary, write.token)).json(), { ok: true, inserted: false });
    const rows = recentCompletedSessions(db);
    assert.equal(rows.length, 1);
    assert.equal(unassignedSeconds(rows[0]), 100);
    assert.equal(db.prepare("SELECT count(*) AS n FROM focus_sessions").get()?.n, 0);
  } finally {
    useAsAppDb(undefined);
    db.close();
  }
});
