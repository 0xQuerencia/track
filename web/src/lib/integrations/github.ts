import type { DatabaseSync } from "node:sqlite";
import { upsertRepoEvents } from "../projects/repo-events";
import { finishRun, markError, markSuccess, pruneRuns, startRun } from "./store";
import { nowIso } from "./time";

/*
 * Optional, read-only GitHub sync for projects whose repo URL is on github.com.
 * It only runs when the server has GITHUB_TOKEN, and only ever calls the fixed
 * API origin below: the URL is built from a validated owner/repo pair, so a
 * stored repo URL can never point the server somewhere else (no SSRF).
 */

const API = "https://api.github.com";
const TIMEOUT_MS = 10_000;
const REPO_URL = /^https:\/\/github\.com\/([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?\/?$/;

export type GithubFetch = (url: string, init: RequestInit) => Promise<Response>;
type Json = Record<string, unknown>;

export function parseGithubRepo(url: string | null | undefined): { owner: string; repo: string } | null {
  const match = REPO_URL.exec((url ?? "").trim());
  return match ? { owner: match[1], repo: match[2] } : null;
}

const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const obj = (value: unknown): Json => (value && typeof value === "object" ? (value as Json) : {});

async function getList(path: string, token: string, doFetch: GithubFetch): Promise<Json[]> {
  const response = await doFetch(`${API}${path}`, {
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "track-sync",
    },
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  const body: unknown = await response.json();
  return Array.isArray(body) ? (body.filter((x) => x && typeof x === "object") as Json[]) : [];
}

export async function fetchGithubEvents(
  owner: string,
  repo: string,
  token: string,
  doFetch: GithubFetch = fetch,
): Promise<Json[]> {
  const base = `/repos/${owner}/${repo}`;
  const [commits, pulls, issues, releases] = await Promise.all([
    getList(`${base}/commits?per_page=20`, token, doFetch),
    getList(`${base}/pulls?state=all&per_page=20`, token, doFetch),
    getList(`${base}/issues?state=all&per_page=20`, token, doFetch),
    getList(`${base}/releases?per_page=10`, token, doFetch),
  ]);
  const events: Json[] = [];
  for (const c of commits) {
    const commit = obj(c.commit);
    events.push({
      kind: "commit",
      external_id: str(c.sha),
      title: (str(commit.message) ?? "").split("\n")[0].slice(0, 300),
      url: str(c.html_url),
      author: str(obj(c.author).login) ?? str(obj(commit.author).name),
      occurred_at: str(obj(commit.author).date),
    });
  }
  for (const p of pulls)
    events.push({
      kind: "pr",
      external_id: String(p.number),
      title: str(p.title),
      url: str(p.html_url),
      state: p.merged_at ? "merged" : str(p.state),
      author: str(obj(p.user).login),
      occurred_at: str(p.updated_at),
    });
  for (const i of issues) {
    if (i.pull_request) continue; // the issues endpoint also lists PRs
    events.push({
      kind: "issue",
      external_id: String(i.number),
      title: str(i.title),
      url: str(i.html_url),
      state: str(i.state),
      author: str(obj(i.user).login),
      occurred_at: str(i.updated_at),
    });
  }
  for (const r of releases)
    events.push({
      kind: "release",
      external_id: String(r.id),
      title: str(r.name) ?? str(r.tag_name),
      url: str(r.html_url),
      state: r.draft ? "draft" : r.prerelease ? "prerelease" : "published",
      author: str(obj(r.author).login),
      occurred_at: str(r.published_at),
    });
  return events.filter((e) => e.external_id);
}

export type GithubSyncResult = { ok: boolean; message: string };

/** Syncs up to `limit` projects with a github.com repo URL. Records one sync run. */
export async function syncGithubProjects(
  db: DatabaseSync,
  token: string | undefined,
  doFetch: GithubFetch = fetch,
  limit = 20,
): Promise<GithubSyncResult> {
  if (!token) return { ok: false, message: "GITHUB_TOKEN is not set on the server." };
  const projects = db
    .prepare(`SELECT id, repo FROM projects WHERE archived = 0 AND repo LIKE 'https://github.com/%' ORDER BY id LIMIT ?`)
    .all(limit) as { id: number; repo: string }[];
  const started = nowIso();
  const runId = startRun(db, "github", "manual", started);
  let received = 0;
  let changed = 0;
  let synced = 0;
  const failures: string[] = [];
  for (const project of projects) {
    const target = parseGithubRepo(project.repo);
    if (!target) continue;
    try {
      const events = await fetchGithubEvents(target.owner, target.repo, token, doFetch);
      const result = upsertRepoEvents(project.id, events);
      received += events.length;
      changed += result.inserted + result.updated;
      synced++;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "unknown error");
    }
  }
  const ok = failures.length === 0;
  const error = ok ? null : failures[0];
  finishRun(db, runId, { finishedAt: nowIso(), ok, received, changed, error });
  pruneRuns(db, "github");
  if (ok) markSuccess(db, "github", nowIso());
  else markError(db, "github", nowIso(), failures[0]);
  return {
    ok,
    message: ok
      ? `Synced ${synced} project${synced === 1 ? "" : "s"}, ${changed} change${changed === 1 ? "" : "s"}.`
      : `Synced ${synced}, ${failures.length} failed: ${failures[0]}`,
  };
}
