import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { createJobWithinTransaction, getJob, jobTransaction } from "./jobs";
import { completeStep, failStep, leaseActive, type JobErrorCode, type StepLease } from "./job-leases";

type Env = Record<string, string | undefined>;
export const ciRepository = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9_.-]{1,100}$/)
  .refine(value => !value.endsWith("/.") && !value.endsWith("/.."));
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function ciConfig(env: Env = process.env) {
  const repos = new Map<string, string>();
  for (const repo of (env.TRACK_DREAMER_GITHUB_REPOS ?? "").split(",").map(value => value.trim())) {
    if (ciRepository.safeParse(repo).success && !repos.has(repo.toLowerCase())) {
      repos.set(repo.toLowerCase(), repo);
      if (repos.size === 30) break;
    }
  }
  return {
    enabled: env.TRACK_DREAMER_CI_ENABLED === "1",
    repos: [...repos.values()],
    githubAuthenticated: Boolean(env.TRACK_DREAMER_CI_GITHUB_TOKEN),
  };
}

function permission(repo: string, env: Env) {
  const config = ciConfig(env);
  if (!config.enabled || !config.repos.some(value => value.toLowerCase() === repo.toLowerCase())) return null;
  return digest(JSON.stringify({
    repo: repo.toLowerCase(),
    credential: env.TRACK_DREAMER_CI_GITHUB_TOKEN ? digest(env.TRACK_DREAMER_CI_GITHUB_TOKEN) : null,
  }));
}

export function enqueueCiJob(db: DatabaseSync, id: string, rawRepo: string, now = Date.now(), env: Env = process.env) {
  const input = ciRepository.parse(rawRepo);
  const repo = ciConfig(env).repos.find(value => value.toLowerCase() === input.toLowerCase()) ?? input;
  return jobTransaction(db, () => {
    const existing = getJob(db, id);
    if (existing) {
      if (existing.ciRepository?.toLowerCase() !== repo.toLowerCase()) throw Error("Conflicting mission replay");
      return existing;
    }
    const approval = permission(repo, env);
    if (!approval) throw Error("Enable the GitHub CI specialist and allowlist this repository first");
    if (Number(db.prepare("SELECT COUNT(*) AS n FROM dreamer_jobs WHERE ci_repository IS NOT NULL AND created_ms>?").get(now - 60000)?.n) >= 10) throw Error("CI mission rate limit reached");
    const goal = "Check GitHub Actions for " + repo;
    const job = createJobWithinTransaction(db, id, {
      objective: goal, includeContext: false, steps: [
        { id: "chief", agentKey: "chief", dependsOn: [], maxTokens: 256, maxAttempts: 1 },
      ], attemptBudget: 1, tokenBudget: 256,
    }, now);
    db.prepare("UPDATE dreamer_jobs SET ci_repository=?, ci_permission_sha256=? WHERE id=?").run(repo, approval, job.id);
    return getJob(db, id)!;
  });
}

const MAX_BYTES = 512 * 1024;
const run = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  status: z.string().regex(/^[a-z_]{1,40}$/),
  conclusion: z.string().regex(/^[a-z_]{1,40}$/).nullable(),
  created_at: z.iso.datetime({ offset: true }),
});
const runList = z.object({ workflow_runs: z.array(run) });

class UpstreamError extends Error {
  constructor(readonly code: JobErrorCode) { super(code); }
}

async function boundedResponse(response: Response) {
  if (!response.ok) {
    const denied = response.status === 401 || response.status === 403 || response.status === 404;
    const limited = response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0");
    throw new UpstreamError(limited ? "provider_rate_limit" : denied ? "provider_unavailable" : "provider_error");
  }
  const size = response.headers.get("content-length");
  if (!response.body || size !== null && (!/^\d+$/.test(size) || Number(size) > MAX_BYTES)
      || !/^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) {
    throw new UpstreamError("invalid_output");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, body = "";
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_BYTES) {
        void reader.cancel().catch(() => {});
        throw new UpstreamError("invalid_output");
      }
      body += decoder.decode(next.value, { stream: true });
    }
    return runList.parse(JSON.parse(body + decoder.decode())).workflow_runs.slice(0, 5);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) throw new UpstreamError("invalid_output");
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function fetchCi(repo: string, env: Env, request: typeof fetch) {
  const path = ciRepository.parse(repo).split("/").map(encodeURIComponent).join("/");
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "Track-CI-Specialist/1.0",
    "x-github-api-version": "2022-11-28",
  };
  if (env.TRACK_DREAMER_CI_GITHUB_TOKEN) headers.authorization = "Bearer " + env.TRACK_DREAMER_CI_GITHUB_TOKEN;
  const response = await request("https://api.github.com/repos/" + path + "/actions/runs?per_page=5", {
    method: "GET", headers, redirect: "error", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  return { path, runs: await boundedResponse(response) };
}

export async function executeCiStep(
  db: DatabaseSync, lease: StepLease,
  { env = process.env, fetch: request = fetch, now = Date.now }: { env?: Env; fetch?: typeof fetch; now?: () => number } = {},
) {
  function gate() {
    if (!leaseActive(db, lease, now())) return null;
    const row = db.prepare("SELECT ci_repository,ci_permission_sha256 FROM dreamer_jobs WHERE id=?").get(lease.jobId);
    if (typeof row?.ci_repository !== "string" || lease.stepId !== "chief") return null;
    const current = permission(row.ci_repository, env);
    return { repo: row.ci_repository, permitted: Boolean(current && current === row.ci_permission_sha256) };
  }
  function finish(code: JobErrorCode) {
    return failStep(db, lease, code, false, now()) ? "failed" : "stale";
  }
  const before = gate();
  if (!before) return "stale";
  if (!before.permitted) return finish("policy_disabled");
  try {
    const { path, runs } = await fetchCi(before.repo, env, request);
    const after = gate();
    if (!after) return "stale";
    if (!after.permitted) return finish("policy_disabled");
    // Only API status fields and constructed links are reported. Workflow names, branch names,
    // raw logs and arbitrary upstream URLs never enter the job report or any model prompt.
    const lines = runs.map(item =>
      "- [Run #" + item.id + "](https://github.com/" + path + "/actions/runs/" + item.id + ") · "
      + (item.conclusion ?? item.status).replaceAll("_", " ") + " · " + item.created_at,
    );
    const output = [
      "## GitHub Actions status", "Checked " + new Date(now()).toISOString() + " (UTC).",
      "Recent runs across repository branches; this snapshot does not diagnose failures.",
      lines.length ? lines.join("\n") : "GitHub returned no visible runs in this snapshot.",
    ].join("\n\n");
    return completeStep(db, lease, output, now()) ? "complete" : "stale";
  } catch (error) {
    const after = gate();
    if (!after) return "stale";
    if (!after.permitted) return finish("policy_disabled");
    return finish(error instanceof UpstreamError ? error.code
      : error instanceof Error && error.name === "TimeoutError" ? "provider_timeout" : "provider_error");
  }
}
