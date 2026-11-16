#!/usr/bin/env node
/*
 * track-connector: reports metadata about local git repositories and AI coding
 * sessions to a Track server. It only reads this machine and never writes to the
 * tools' folders. What is read and sent is listed in README.md.
 *
 * Commands:
 *   scan       list git repos under the configured roots (no network)
 *   sessions   list AI sessions found per tool (no network)
 *   push       send everything (ignores saved state)
 *   once       send only what changed since the last run (for the timer)
 * Flags: --config <file>, --dry-run (print the exact payloads, send nothing).
 * Token: TRACK_CONNECTOR_TOKEN in the environment. It is never read from a file.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

export const PAYLOAD_VERSION = 1;
export const MAX_DEPTH_LIMIT = 3;
export const CHUNK_SIZE = 1000;
const HEAD_BYTES = 64 * 1024;
const CODEX_HEAD_BYTES = 256 * 1024;
const MAX_JSON_FILE_BYTES = 256 * 1024;
const GIT_TIMEOUT_MS = 5000;
const REQUEST_TIMEOUT_MS = 15000;
export const RETRY_DELAYS_MS = [1000, 2000, 4000];
const TOKEN_IN_TEXT = /\btrk_[A-Za-z0-9_-]+/g;
const TOKEN_SHAPE = /^trk_[A-Za-z0-9_-]{43}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/+=-]{0,199}$/;
const RESUME_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_PATH = /^[A-Za-z0-9~/][A-Za-z0-9._~/-]{0,199}$/;
const COMMIT_SHA = /^[0-9a-f]{40,64}$/;
const SKIP_DIRS = new Set(["node_modules", ".cache"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
export const TOOLS = ["claude_code", "codex", "opencode", "antigravity"];
const DEFAULT_TOOLS = ["claude_code", "codex", "opencode"];
const EXEC_TO_TOOL = { claude: "claude_code", codex: "codex", opencode: "opencode" };
const RESUME_TEMPLATE = {
  claude_code: (id) => `claude --resume ${id}`,
  codex: (id) => `codex resume ${id}`,
  opencode: (id) => `opencode --session ${id}`,
};

export class ConnectorError extends Error {
  constructor(message, retryable) {
    super(message);
    this.name = "ConnectorError";
    this.retryable = retryable;
  }
}

/* ---------- pure helpers (unit-tested) ---------- */

/** Trims, strips control characters, and cuts to `max` code points. */
export function cleanText(value, max, multiline = false) {
  if (typeof value !== "string") return null;
  const stripped = value.replace(CONTROL, "");
  const text = (multiline ? stripped.replace(/\r\n?/g, "\n") : stripped.replace(/[\t\r\n]+/g, " ")).trim();
  return text ? Array.from(text).slice(0, max).join("") : null;
}

/** Removes tokens from any text before it is logged or printed. */
export function redact(text, token) {
  let out = String(text);
  if (token) out = out.split(token).join("[REDACTED]");
  return out.replace(TOKEN_IN_TEXT, "trk_[REDACTED]");
}

export function parseIso(value) {
  const text = cleanText(value, 60);
  const ms = text ? Date.parse(text) : Number.NaN;
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * Turns a git remote into {display, identity}. Credentials are dropped first,
 * so neither field can carry a password. display is https form without ".git";
 * identity is the lowercased host and path, used for hashing.
 */
export function scrubRemote(raw) {
  const text = cleanText(raw, 500);
  if (!text) return null;
  let host;
  let repoPath;
  try {
    const url = new URL(text);
    if (!["https:", "http:", "ssh:", "git:"].includes(url.protocol)) return null;
    host = url.hostname;
    repoPath = url.pathname;
  } catch {
    const scp = /^(?:[^@/\s]+@)?([A-Za-z0-9.-]+):([^\s]+)$/.exec(text);
    if (!scp) return null;
    host = scp[1];
    repoPath = `/${scp[2]}`;
  }
  const cleanPath = repoPath.replace(/\/+$/, "").replace(/\.git$/, "");
  if (!host || !cleanPath || cleanPath === "/") return null;
  const lowerHost = host.toLowerCase();
  return { display: `https://${lowerHost}${cleanPath}`, identity: `${lowerHost}${cleanPath.toLowerCase()}` };
}

/** Stable id for a repo: a hash of its remote identity, or of its path if it has no remote. */
export function externalIdFor(repoPath, remote) {
  const basis = remote ? `remote:${remote.identity}` : `path:${repoPath}`;
  return `git-${createHash("sha256").update(basis).digest("hex").slice(0, 40)}`;
}

export function isInsideRoot(candidate, root) {
  const rel = path.relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/** True when `candidate` resolves to a folder under one of `roots`. */
export function isPathAllowed(candidate, roots) {
  const resolved = path.resolve(candidate);
  return roots.some((root) => isInsideRoot(resolved, path.resolve(root)));
}

/** Roots must be absolute folders under the home directory, and not home itself. */
export function validateRoots(roots, home) {
  if (!Array.isArray(roots) || roots.length === 0) return ["roots must list at least one folder"];
  const errors = [];
  const homeDir = path.resolve(home);
  for (const root of roots) {
    if (typeof root !== "string" || !path.isAbsolute(root)) {
      errors.push("each root must be an absolute path");
      continue;
    }
    const resolved = path.resolve(root);
    if (resolved === path.parse(resolved).root) errors.push("a root cannot be the filesystem root");
    else if (resolved === homeDir) errors.push("pick a folder below your home directory, not the home directory itself");
    else if (!isInsideRoot(resolved, homeDir)) errors.push("each root must be inside your home directory");
  }
  return errors;
}

export function shouldSkipDir(name) {
  return name.startsWith(".") || SKIP_DIRS.has(name);
}

/** The longest repo path that contains `cwd`, or null. Used as the project hint. */
export function projectHintFor(cwd, repoPaths) {
  let best = null;
  for (const repo of repoPaths)
    if (isInsideRoot(cwd, repo) && (best === null || repo.length > best.length)) best = repo;
  return best;
}

/** Documented resume forms only. Anything that would not pass the server's allowlist is omitted. */
export function resumeCommandFor(tool, id, cwd) {
  const template = RESUME_TEMPLATE[tool];
  if (!template || !RESUME_ID.test(id)) return null;
  const command = template(id);
  return cwd && SAFE_PATH.test(cwd) ? `cd ${cwd} && ${command}` : command;
}

/** Reads only the fields we need from the head of a Claude Code transcript. Never message text. */
export function parseClaudeHead(text) {
  const out = { cwd: null, model: null, startedAt: null, title: null };
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    if (!out.cwd && typeof entry.cwd === "string") out.cwd = entry.cwd;
    if (!out.startedAt && typeof entry.timestamp === "string") out.startedAt = parseIso(entry.timestamp);
    if (!out.model && typeof entry.message?.model === "string") out.model = entry.message.model;
    if (entry.type === "summary" && typeof entry.summary === "string") out.title = entry.summary;
  }
  return out;
}

/** The first line of a Codex rollout file holds the session metadata. */
export function parseCodexFirstLine(line) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }
  if (entry?.type !== "session_meta" || typeof entry.payload?.id !== "string") return null;
  return {
    externalId: entry.payload.id,
    cwd: typeof entry.payload.cwd === "string" ? entry.payload.cwd : null,
    startedAt: parseIso(entry.payload.timestamp ?? entry.timestamp),
  };
}

/** The reduced session record. Only these fields ever leave the adapter. */
export function parseOpencodeSession(json) {
  if (!json || typeof json.id !== "string") return null;
  const created = json.time?.created;
  const updated = json.time?.updated;
  return {
    externalId: json.id,
    cwd: typeof json.directory === "string" ? json.directory : null,
    startedAt: typeof created === "number" ? new Date(created).toISOString() : null,
    lastActivityAt: typeof updated === "number" ? new Date(updated).toISOString() : null,
    title: typeof json.title === "string" ? json.title : null,
    model: null,
  };
}

/** Marks sessions whose folder has a live process of the same tool. Exact path match only. */
export function markRunning(sessions, processes) {
  const live = new Set(processes.map((proc) => `${proc.tool}\u0000${proc.cwd}`));
  return sessions.map((session) => ({
    ...session,
    status: session.cwd && live.has(`${session.tool}\u0000${session.cwd}`) ? "running_verified" : "historical",
  }));
}

/** Builds the server's session item. Keys are whitelisted; titles only when allowed. */
export function sessionItem(session, { repoPaths = [], sendTitles = false } = {}) {
  if (!SESSION_ID.test(session.externalId)) return null;
  const cwd = session.cwd && path.isAbsolute(session.cwd) ? session.cwd : null;
  const hint = cwd ? projectHintFor(cwd, repoPaths) ?? cwd : null;
  return {
    external_id: session.externalId,
    title: sendTitles ? cleanText(session.title, 300) : null,
    project_hint: hint ? cleanText(hint, 300) : null,
    cwd_hint: cwd ? cleanText(cwd, 500) : null,
    created_at: session.startedAt ?? null,
    last_activity_at: session.lastActivityAt ?? null,
    status: session.status ?? "historical",
    resume_command: resumeCommandFor(session.tool, session.externalId, cwd),
    model: cleanText(session.model, 100),
  };
}

export function chunk(items, size = CHUNK_SIZE) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** One sessions envelope. Callers chunk items to CHUNK_SIZE first, so it stays within the server limit. */
export function sessionEnvelope(tool, items, generatedAt) {
  return { version: PAYLOAD_VERSION, source: "connector", tool, generated_at: generatedAt, sessions: items };
}

/** One Projects inventory entry, in the shape src/lib/projects/import-schema.ts reads. */
export function inventoryProject(repo) {
  const remote = repo.remote;
  const last = repo.last && repo.last.at && COMMIT_SHA.test(repo.last.sha) ? repo.last : null;
  return {
    external_id: externalIdFor(repo.path, remote),
    name: cleanText(repo.name, 200) ?? "repository",
    local_path: cleanText(repo.path, 500),
    git: {
      remote_url: remote ? remote.display : null,
      current_branch: cleanText(repo.branch, 200),
      default_branch: null,
      last_commit: last
        ? { sha: last.sha, message: last.subject ?? "", at: last.at }
        : null,
    },
  };
}

/* ---------- state: what was already sent ---------- */

export function emptyState() {
  return { version: PAYLOAD_VERSION, sessions: {}, inventory: {} };
}

/** Sessions that are new, or whose file changed, or whose running status changed. */
export function pendingSessions(sessions, state) {
  return sessions.filter((session) => {
    const prev = state.sessions[session.tool]?.[session.externalId];
    return !prev || prev.mtimeMs !== session.mtimeMs || prev.status !== session.status;
  });
}

/** Returns a new state with the given sessions recorded as sent. */
export function recordSentSessions(state, sessions) {
  const next = { ...state, sessions: { ...state.sessions } };
  for (const session of sessions) {
    const bucket = { ...(next.sessions[session.tool] ?? {}) };
    bucket[session.externalId] = { mtimeMs: session.mtimeMs, status: session.status };
    next.sessions[session.tool] = bucket;
  }
  return next;
}

export function inventoryHash(project) {
  return createHash("sha256").update(JSON.stringify(project)).digest("hex");
}

/* ---------- filesystem: discovery and reading ---------- */

async function exists(file) {
  try {
    await fsp.lstat(file);
    return true;
  } catch {
    return false;
  }
}

/** Files under `root` down to `maxDepth` folders, without following symlinks. */
export async function listFiles(root, maxDepth, match) {
  const found = [];
  async function walk(dir, depth) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && match(entry.name)) found.push(full);
      else if (entry.isDirectory() && depth < maxDepth) await walk(full, depth + 1);
    }
  }
  await walk(root, 0);
  return found.sort();
}

/** Reads at most `bytes` from the start of a file. Opened read-only. */
export async function readHead(file, bytes = HEAD_BYTES) {
  const handle = await fsp.open(file, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

async function readClaude(file, sendTitles) {
  const stat = await fsp.stat(file);
  const head = parseClaudeHead(await readHead(file));
  return {
    tool: "claude_code",
    externalId: path.basename(file, ".jsonl"),
    cwd: head.cwd,
    startedAt: head.startedAt,
    lastActivityAt: stat.mtime.toISOString(),
    model: head.model,
    title: sendTitles ? head.title : null,
    mtimeMs: stat.mtimeMs,
  };
}

async function readCodex(file) {
  const stat = await fsp.stat(file);
  const first = (await readHead(file, CODEX_HEAD_BYTES)).split("\n", 1)[0];
  const meta = parseCodexFirstLine(first);
  if (!meta) return null;
  return {
    tool: "codex",
    externalId: meta.externalId,
    cwd: meta.cwd,
    startedAt: meta.startedAt,
    lastActivityAt: stat.mtime.toISOString(),
    model: null,
    title: null,
    mtimeMs: stat.mtimeMs,
  };
}

async function readOpencode(file, sendTitles) {
  const stat = await fsp.stat(file);
  if (stat.size > MAX_JSON_FILE_BYTES) return null;
  const parsed = parseOpencodeSession(JSON.parse(await fsp.readFile(file, "utf8")));
  if (!parsed) return null;
  return {
    tool: "opencode",
    ...parsed,
    lastActivityAt: parsed.lastActivityAt ?? stat.mtime.toISOString(),
    title: sendTitles ? parsed.title : null,
    mtimeMs: stat.mtimeMs,
  };
}

/** Where each tool keeps its session files, and how to read one file. */
export const ADAPTERS = {
  claude_code: {
    root: (home) => path.join(home, ".claude", "projects"),
    depth: 2,
    match: (name) => name.endsWith(".jsonl"),
    read: readClaude,
  },
  codex: {
    root: (home) => path.join(home, ".codex", "sessions"),
    depth: 4,
    match: (name) => name.startsWith("rollout-") && name.endsWith(".jsonl"),
    read: (file) => readCodex(file),
  },
  opencode: {
    root: (home) => path.join(home, ".local", "share", "opencode", "storage", "session"),
    depth: 3,
    match: (name) => name.endsWith(".json"),
    read: readOpencode,
  },
};

/**
 * Reads one tool's session metadata. Each file is isolated: a bad file is
 * counted and skipped, and error text is a short code, never a path or content.
 */
export async function collectSessions(tool, { home, sendTitles = false }) {
  if (tool === "antigravity") return { tool, status: "unsupported", sessions: [], errors: [] };
  const adapter = ADAPTERS[tool];
  if (!adapter) return { tool, status: "unsupported", sessions: [], errors: [] };
  const root = adapter.root(home);
  if (!(await exists(root))) return { tool, status: "not_found", sessions: [], errors: [] };

  let files;
  try {
    files = await listFiles(root, adapter.depth, adapter.match);
  } catch (error) {
    return { tool, status: "error", sessions: [], errors: [errorCode(error)] };
  }
  const sessions = [];
  const errors = [];
  for (const file of files) {
    try {
      const session = await adapter.read(file, sendTitles);
      if (session) sessions.push(session);
      else errors.push(`skipped ${path.basename(file)}: unrecognised format`);
    } catch (error) {
      errors.push(`${path.basename(file)}: ${errorCode(error)}`);
    }
  }
  return { tool, status: "ok", sessions, errors };
}

function errorCode(error) {
  return typeof error?.code === "string" ? error.code : "read failed";
}

/** Each live process that looks like a known tool, with its working directory. */
export async function runningProcesses(procRoot = "/proc") {
  let pids;
  try {
    pids = await fsp.readdir(procRoot);
  } catch {
    return [];
  }
  const found = [];
  for (const pid of pids) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      const argv = (await fsp.readFile(path.join(procRoot, pid, "cmdline"), "utf8")).split("\u0000");
      const tool = [argv[0], argv[1]]
        .map((arg) => EXEC_TO_TOOL[path.basename(arg ?? "")])
        .find(Boolean);
      if (!tool) continue;
      const cwd = await fsp.readlink(path.join(procRoot, pid, "cwd"));
      found.push({ tool, cwd });
    } catch {
      // The process ended, or it belongs to another user.
    }
  }
  return found;
}

/** Git repos under the roots. Symlinks are not followed, and a repo is not searched inside. */
export async function findRepos(roots, maxDepth) {
  const limit = Math.min(Math.max(0, maxDepth), MAX_DEPTH_LIMIT);
  const repos = [];
  async function visit(dir, depth) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((entry) => entry.name === ".git")) {
      repos.push(dir);
      return;
    }
    if (depth >= limit) return;
    for (const entry of entries) {
      if (entry.isDirectory() && !shouldSkipDir(entry.name)) await visit(path.join(dir, entry.name), depth + 1);
    }
  }
  for (const root of roots) await visit(root, 0);
  return [...new Set(repos)].sort();
}

/** Read-only git queries. Each one runs with execFile (no shell) and a timeout. */
export async function readRepo(repoPath, gitBin = "git") {
  const git = async (args) => {
    try {
      const { stdout } = await run(gitBin, ["-C", repoPath, ...args], {
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 64 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
      return stdout.trim();
    } catch {
      return null;
    }
  };
  const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const log = await git(["log", "-1", "--format=%H%x1f%s%x1f%cI"]);
  let last = null;
  if (log) {
    const [sha, subject, at] = log.split("\u001f");
    if (COMMIT_SHA.test(sha ?? "")) last = { sha, subject: cleanText(subject, 300), at: parseIso(at) };
  }
  return {
    path: repoPath,
    name: path.basename(repoPath),
    remote: scrubRemote(await git(["remote", "get-url", "origin"])),
    branch: branch && branch !== "HEAD" ? branch : null,
    last,
  };
}

/* ---------- transport ---------- */

/** Checks the server URL. https is required, except for a local development server. */
export function checkServerUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return "serverUrl is not a valid URL";
  }
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)) return null;
  return "serverUrl must use https (http is allowed only for localhost)";
}

export function endpoint(serverUrl, route) {
  const base = new URL(serverUrl);
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  return new URL(`api/integrations/${route}`, base).toString();
}

/**
 * One request with bounded retries. Retries only on network errors, timeouts,
 * 429 and 5xx. redirect:"error" keeps the bearer token from following a redirect.
 */
export async function requestJson({
  serverUrl,
  route,
  method = "POST",
  token,
  body,
  fetchImpl = fetch,
  delays = RETRY_DELAYS_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const url = endpoint(serverUrl, route);
  const headers = { authorization: `Bearer ${token}`, "user-agent": "track-connector/1" };
  if (body !== undefined) headers["content-type"] = "application/json";
  let lastProblem = "no attempt";
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const response = await fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return await response.json().catch(() => ({}));
      lastProblem = `HTTP ${response.status}`;
      if (response.status !== 429 && response.status < 500)
        throw new ConnectorError(`${lastProblem} from ${route}`, false);
    } catch (error) {
      if (error instanceof ConnectorError && !error.retryable) throw error;
      lastProblem = error?.name === "TimeoutError" ? "timed out" : "network error";
    }
    if (attempt < delays.length) await sleep(delays[attempt]);
  }
  throw new ConnectorError(`${lastProblem} for ${route} after ${delays.length + 1} attempts`, true);
}

/* ---------- configuration and state files ---------- */

export function defaultPaths(env, home) {
  const config = env.XDG_CONFIG_HOME || path.join(home, ".config");
  const state = env.XDG_STATE_HOME || path.join(home, ".local", "state");
  return {
    config: path.join(config, "track-connector", "config.json"),
    state: path.join(state, "track-connector", "state.json"),
  };
}

const SECRET_KEY = /token|secret|password|key/i;

/** Validates the config. A token in the file is refused outright. */
export function parseConfig(text, home) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["config is not valid JSON"] };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["config must be an object"] };
  const errors = [];
  if (Object.keys(raw).some((key) => SECRET_KEY.test(key)))
    errors.push("keep secrets out of the config file; set TRACK_CONNECTOR_TOKEN in the environment instead");
  const serverProblem = typeof raw.serverUrl === "string" ? checkServerUrl(raw.serverUrl) : "serverUrl is required";
  if (serverProblem) errors.push(serverProblem);
  errors.push(...validateRoots(raw.roots, home));
  const maxDepth = raw.maxDepth ?? MAX_DEPTH_LIMIT;
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > MAX_DEPTH_LIMIT)
    errors.push(`maxDepth must be an integer from 0 to ${MAX_DEPTH_LIMIT}`);
  const tools = raw.tools ?? DEFAULT_TOOLS;
  if (!Array.isArray(tools) || tools.some((tool) => !TOOLS.includes(tool)))
    errors.push(`tools must be a list drawn from: ${TOOLS.join(", ")}`);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    config: {
      serverUrl: raw.serverUrl,
      roots: raw.roots.map((root) => path.resolve(root)),
      maxDepth,
      tools,
      sendTitles: raw.sendTitles === true,
    },
  };
}

export async function loadState(file) {
  try {
    const parsed = JSON.parse(await fsp.readFile(file, "utf8"));
    if (parsed?.version === PAYLOAD_VERSION) return { ...emptyState(), ...parsed };
  } catch {
    // First run, or an unreadable file: start from nothing.
  }
  return emptyState();
}

export async function saveState(file, state) {
  await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.tmp`;
  await fsp.writeFile(temp, JSON.stringify(state), { mode: 0o600 });
  await fsp.rename(temp, file);
}

/* ---------- commands ---------- */

function printJson(io, value) {
  io.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Repo metadata for every git repo under the roots. Roots are resolved and must stay under home. */
async function discover(config, home) {
  const roots = [];
  for (const root of config.roots) {
    try {
      const real = await fsp.realpath(root);
      if (validateRoots([real], home).length === 0) roots.push(real);
    } catch {
      // A missing root contributes no repos.
    }
  }
  const repoPaths = await findRepos(roots, config.maxDepth);
  const repos = [];
  for (const repoPath of repoPaths) repos.push(await readRepo(repoPath));
  return repos;
}

/** Sessions for every configured tool, each tagged with whether its folder has a live process. */
async function collectAll(config, home) {
  const processes = await runningProcesses();
  const results = [];
  for (const tool of config.tools) {
    const result = await collectSessions(tool, { home, sendTitles: config.sendTitles });
    results.push({ ...result, sessions: markRunning(result.sessions, processes) });
  }
  return results;
}

async function readConfig(file, home) {
  let text;
  try {
    text = await fsp.readFile(file, "utf8");
  } catch {
    return { ok: false, errors: [`config file not found at ${file}; copy config.example.json there`] };
  }
  return parseConfig(text, home);
}

/** Parses argv into a command, flags and an optional config path. */
export function parseArgs(argv) {
  const args = { command: null, config: null, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--config") args.config = argv[++i] ?? null;
    else if (!arg.startsWith("-") && args.command === null) args.command = arg;
    else return { error: `unknown argument: ${arg}` };
  }
  return args;
}

const USAGE = `track-connector <scan|sessions|push|once> [--config FILE] [--dry-run]
  scan      list git repos under the roots (no network)
  sessions  list AI sessions per tool (no network)
  push      send everything, ignoring saved state
  once      send what changed since the last run
Set TRACK_CONNECTOR_TOKEN to send. --dry-run prints the exact payloads and sends nothing.
`;

/** Runs one command and returns the exit code. Output never includes the token. */
export async function main(argv, { env = process.env, home = os.homedir(), io = { stdout: process.stdout, stderr: process.stderr }, fetchImpl = fetch } = {}) {
  const args = parseArgs(argv);
  if (args.error || args.help || !args.command) {
    io.stderr.write(args.error ? `${args.error}\n${USAGE}` : USAGE);
    return args.help ? 0 : 2;
  }
  if (!["scan", "sessions", "push", "once"].includes(args.command)) {
    io.stderr.write(`unknown command: ${args.command}\n${USAGE}`);
    return 2;
  }
  const loaded = await readConfig(args.config ?? defaultPaths(env, home).config, home);
  if (!loaded.ok) {
    for (const error of loaded.errors) io.stderr.write(`config: ${error}\n`);
    return 2;
  }
  const config = loaded.config;
  try {
    if (args.command === "scan") {
      printJson(io, { repos: (await discover(config, home)).map(inventoryProject) });
      return 0;
    }
    if (args.command === "sessions") {
      const results = await collectAll(config, home);
      printJson(io, results.map(({ tool, status, sessions, errors }) => ({ tool, status, found: sessions.length, errors })));
      return 0;
    }
    const statePath = env.TRACK_CONNECTOR_STATE || defaultPaths(env, home).state;
    return await sync({ config, home, io, env, fetchImpl, statePath, full: args.command === "push", dryRun: args.dryRun });
  } catch (error) {
    io.stderr.write(`${redact(error instanceof Error ? error.message : String(error), env.TRACK_CONNECTOR_TOKEN)}\n`);
    return 1;
  }
}

/** Builds the payloads for one run. Pure with respect to the network: it only reads. */
export async function buildPlan({ config, home, state, full, generatedAt }) {
  const repos = await discover(config, home);
  const repoPaths = repos.map((repo) => repo.path);
  const projects = repos.map(inventoryProject);
  const changedProjects = projects.filter((project) => full || state.inventory[project.external_id] !== inventoryHash(project));
  const results = await collectAll(config, home);

  const batches = [];
  for (const result of results) {
    const pending = full ? result.sessions : pendingSessions(result.sessions, state);
    const entries = pending
      .map((session) => ({ session, item: sessionItem(session, { repoPaths, sendTitles: config.sendTitles }) }))
      .filter((entry) => entry.item !== null);
    for (const group of chunk(entries)) {
      batches.push({
        tool: result.tool,
        sessions: group.map((entry) => entry.session),
        envelope: sessionEnvelope(result.tool, group.map((entry) => entry.item), generatedAt),
      });
    }
  }
  const inventory = chunk(changedProjects).map((group) => ({
    version: PAYLOAD_VERSION,
    source: "connector",
    generated_at: generatedAt,
    projects: group,
  }));
  return { inventory, changedProjects, batches, results };
}

async function sync({ config, home, io, env, fetchImpl, statePath, full, dryRun }) {
  const token = env.TRACK_CONNECTOR_TOKEN ?? "";
  if (!dryRun && !TOKEN_SHAPE.test(token)) {
    io.stderr.write("TRACK_CONNECTOR_TOKEN is missing or malformed. Create a token in Track's Settings.\n");
    return 2;
  }
  const state = full ? emptyState() : await loadState(statePath);
  const plan = await buildPlan({ config, home, state, full, generatedAt: new Date().toISOString() });

  if (dryRun) {
    printJson(io, {
      inventory: plan.inventory,
      sessions: plan.batches.map((batch) => ({ tool: batch.tool, envelope: batch.envelope })),
    });
    return 0;
  }

  try {
    await requestJson({ serverUrl: config.serverUrl, route: "ping", method: "GET", token, fetchImpl });
  } catch (error) {
    io.stderr.write(`cannot reach Track: ${redact(error.message, token)}\n`);
    return 1;
  }

  const failures = [];
  let nextState = { ...state, sessions: { ...state.sessions }, inventory: { ...state.inventory } };
  const sentInventory = [];
  for (const envelope of plan.inventory) {
    try {
      await requestJson({ serverUrl: config.serverUrl, route: "inventory", token, body: envelope, fetchImpl });
      sentInventory.push(...envelope.projects);
      io.stdout.write(`inventory: ${envelope.projects.length} repo(s) sent\n`);
    } catch (error) {
      failures.push(`inventory: ${redact(error.message, token)}`);
    }
  }
  for (const project of sentInventory) nextState.inventory[project.external_id] = inventoryHash(project);

  for (const batch of plan.batches) {
    try {
      const reply = await requestJson({ serverUrl: config.serverUrl, route: "sessions", token, body: batch.envelope, fetchImpl });
      nextState = recordSentSessions(nextState, batch.sessions);
      io.stdout.write(`${batch.tool}: ${batch.sessions.length} session(s) sent (created ${reply.created ?? 0}, updated ${reply.updated ?? 0})\n`);
    } catch (error) {
      failures.push(`${batch.tool}: ${redact(error.message, token)}`);
    }
  }
  await saveState(statePath, nextState);
  for (const failure of failures) io.stderr.write(`${failure}\n`);
  return failures.length ? 1 : 0;
}

const isMain = process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
