import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createToken } from "@/lib/security/integration-tokens";
import { closeTestDb, installTestDb } from "@/lib/testing/test-db";
import { POST } from "./route";

let db: ReturnType<typeof installTestDb>;
beforeEach(() => { db = installTestDb(); });
afterEach(() => closeTestDb());

const request = (token?: string) =>
  new Request("http://track.local/api/study/jobs", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("POST /api/study/jobs", () => {
  it("fails closed without a token and rejects other scopes", async () => {
    assert.equal((await POST(request())).status, 401);
    assert.equal((await POST(request("trk_" + "x".repeat(43)))).status, 401);
    const wrong = createToken(db, "dreamer", ["dreamer:run"]);
    assert.equal((await POST(request(wrong.token))).status, 403);
  });
  it("runs due jobs once and reports repeats as skipped", async () => {
    const token = createToken(db, "timer", ["study:jobs"]);
    const first = (await (await POST(request(token.token))).json()) as { ok: boolean; jobs: { job: string; result: string }[] };
    assert.equal(first.ok, true);
    const again = (await (await POST(request(token.token))).json()) as { jobs: { result: string }[] };
    assert.ok(again.jobs.every((j) => j.result === "skipped"));
  });
});
