import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { closeTestDb, installTestDb } from "@/lib/testing/test-db";
import { createToken } from "@/lib/security/integration-tokens";
import { POST } from "./route";

let db: ReturnType<typeof installTestDb>;
beforeEach(() => { db = installTestDb(); });
afterEach(() => closeTestDb());

function request(token?: string) {
  return new Request("http://track.local/api/dreamer/run", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("POST /api/dreamer/run", () => {
  it("fails closed without the scoped integration token", async () => {
    const response = await POST(request());
    assert.equal(response.status, 401);
  });

  it("requires dreamer:run and returns only run counts", async () => {
    const readOnly = createToken(db, "metadata only", ["metadata:write"]);
    assert.equal((await POST(request(readOnly.token))).status, 403);
    const dreamer = createToken(db, "scheduled dreamer", ["dreamer:run"]);
    const first = await POST(request(dreamer.token));
    assert.equal(first.status, 200);
    const payload = await first.json() as Record<string, unknown>;
    assert.deepEqual(Object.keys(payload).sort(), ["already_ran", "new_insights", "new_suggestions", "ok", "period_key", "processed", "unchanged"].sort());
    assert.equal(payload.ok, true);
    const again = await POST(request(dreamer.token));
    assert.equal((await again.json() as { already_ran: boolean }).already_ran, true);
  });
});
