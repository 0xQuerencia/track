import assert from "node:assert/strict";
import test from "node:test";
import { closeTestDb, installTestDb } from "@/lib/testing/test-db";
import { ciConfig, enqueueCiJob, executeCiStep } from "./ci-specialist";
import { attemptReceipts, cancelJob, claimStep } from "./job-leases";
import { getJob, listJobs, planChiefJob, createJob } from "./jobs";
import { runWorkerTick } from "./worker";
import { deleteFinishedMission, exportMissionData } from "./job-privacy";
import { parseJobCommand } from "./job-commands";

const model = { id: 42, status: "completed", conclusion: "failure", created_at: "2026-11-26T10:35:20Z",
  name: "Raw and untrusted [name](https://other.example)", html_url: "https://other.example/misdirection" };
const enabled = { TRACK_DREAMER_CI_ENABLED: "1", TRACK_DREAMER_GITHUB_REPOS: "0xQuerencia/track" };
function reply(runs: object[] = [model]) {
  return new Response(JSON.stringify({ workflow_runs: runs }), { headers: { "content-type": "application/json" } });
}

test("CI specialist configuration is opt-in, exact and canonicalized", () => {
  const db = installTestDb();
  try {
    assert.deepEqual(ciConfig({ TRACK_DREAMER_GITHUB_REPOS: "owner/other,OWNER/other,owner/..,https://bad.invalid,owner/good" }), {
      enabled: false, githubAuthenticated: false, repos: ["owner/other", "owner/good"],
    });
    assert.equal(parseJobCommand({ command: "enqueue_ci", id: "job", repo: "0xQuerencia/track" }), null);
    assert.equal(parseJobCommand({ command: "enqueue_ci", id: "job", repo: "https://github.com/0xQuerencia/track", confirm: true }), null);
    assert.throws(() => enqueueCiJob(db, "ci1", "0xQuerencia/track", 1, {}), /allowlist/);
    assert.throws(() => enqueueCiJob(db, "ci1", "0xQuerencia/x", 1, enabled), /allowlist/);
    assert.equal(enqueueCiJob(db, "ci1", "0xquerencia/TRACK", 1, enabled).ciRepository, "0xQuerencia/track");
    assert.equal(enqueueCiJob(db, "ci1", "0xQuerencia/track", 2, enabled).createdMs, 1);
    assert.throws(() => enqueueCiJob(db, "ci1", "0xQuerencia/x", 3, enabled), /replay/);
    assert.equal(listJobs(db).length, 1);
    assert.equal(listJobs(db)[0].ciRepository, "0xQuerencia/track");
  } finally { closeTestDb(); }
});

test("existing worker completes CI with AI unavailable and preserves receipts", async () => {
  const db = installTestDb();
  try {
    createJob(db, "regular", planChiefJob(db, "Review my project architecture"), 1);
    const env = { ...enabled, TRACK_DREAMER_CI_GITHUB_TOKEN: "scoped-secret" };
    enqueueCiJob(db, "ci1", "0xQuerencia/track", 2, env);
    const count = await runWorkerTick(db, "worker", {
      now: () => 100,
      execute: async () => { assert.fail("AI worker must remain paused"); },
      ci: {
        env,
        fetch: async (url, init) => {
          assert.equal(String(url), "https://api.github.com/repos/0xQuerencia/track/actions/runs?per_page=5");
          assert.equal(init?.method, "GET");
          assert.equal(init?.redirect, "error");
          assert.equal(init?.credentials, "omit");
          assert.equal(new Headers(init?.headers).get("authorization"), "Bearer scoped-secret");
          return reply();
        },
      },
    });
    assert.equal(count, 1);
    assert.equal(getJob(db, "regular")?.state, "queued");
    const job = getJob(db, "ci1");
    assert.equal(job?.state, "complete");
    assert.match(job?.steps[0].outputMd ?? "", /https:\/\/github.com\/0xQuerencia\/track\/actions\/runs\/42\) · failure/);
    assert.doesNotMatch(job?.steps[0].outputMd ?? "", /untrusted|other\.example|scoped-secret/);
    assert.equal(attemptReceipts(db, "ci1")[0].status, "complete");
    const exported = JSON.stringify(exportMissionData(db));
    assert.doesNotMatch(exported, /permission_sha256|scoped-secret/);
    assert.equal(deleteFinishedMission(db, "ci1"), "deleted");
    assert.equal(getJob(db, "ci1"), null);
  } finally { closeTestDb(); }
});

test("cancel and configuration changes fence out in-flight evidence", async () => {
  const db = installTestDb();
  try {
    const env = { ...enabled, TRACK_DREAMER_CI_GITHUB_TOKEN: "first" };
    enqueueCiJob(db, "cancel", "0xQuerencia/track", 1, env);
    const first = claimStep(db, "worker", 2)!;
    assert.equal(await executeCiStep(db, first, { env, now: () => 3, fetch: async () => {
      cancelJob(db, "cancel", 3);
      return reply();
    } }), "stale");
    assert.equal(getJob(db, "cancel")?.steps[0].outputMd, null);

    enqueueCiJob(db, "rotated", "0xQuerencia/track", 10, env);
    const next = claimStep(db, "worker", 11)!;
    assert.equal(await executeCiStep(db, next, { env, now: () => 12, fetch: async () => {
      env.TRACK_DREAMER_CI_GITHUB_TOKEN = "second";
      return reply();
    } }), "failed");
    assert.equal(getJob(db, "rotated")?.steps[0].errorCode, "policy_disabled");
    assert.equal(getJob(db, "rotated")?.steps[0].outputMd, null);

    enqueueCiJob(db, "disabled", "0xQuerencia/track", 20, env);
    const last = claimStep(db, "worker", 21)!;
    assert.equal(await executeCiStep(db, last, { env: {}, now: () => 22, fetch: async () => assert.fail("No network when permission revoked") }), "failed");
    assert.equal(getJob(db, "disabled")?.steps[0].errorCode, "policy_disabled");
  } finally { closeTestDb(); }
});

test("malformed or oversized upstream results cannot become evidence", async () => {
  const db = installTestDb();
  try {
    let time = 1;
    for (const fetchResponse of [
      () => reply([{ ...model, status: "failure\n[click](https://other.example)" }]),
      () => new Response("x".repeat(512 * 1024 + 1), { headers: { "content-type": "application/json" } }),
    ]) {
      const id = "bad-" + time;
      enqueueCiJob(db, id, "0xQuerencia/track", time++, enabled);
      const lease = claimStep(db, "worker", time++)!;
      assert.equal(await executeCiStep(db, lease, { env: enabled, now: () => time, fetch: async () => fetchResponse() }), "failed");
      assert.equal(getJob(db, id)?.steps[0].errorCode, "invalid_output");
      assert.equal(getJob(db, id)?.steps[0].outputMd, null);
    }
  } finally { closeTestDb(); }
});
