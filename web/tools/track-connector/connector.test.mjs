// Run with: node --test web/tools/track-connector/connector.test.mjs
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  buildPlan,
  checkServerUrl,
  chunk,
  cleanText,
  collectSessions,
  emptyState,
  endpoint,
  externalIdFor,
  findRepos,
  inventoryProject,
  isInsideRoot,
  isPathAllowed,
  main,
  markRunning,
  parseArgs,
  parseClaudeHead,
  parseCodexFirstLine,
  parseConfig,
  parseOpencodeSession,
  pendingSessions,
  projectHintFor,
  recordSentSessions,
  redact,
  requestJson,
  resumeCommandFor,
  scrubRemote,
  sessionItem,
  shouldSkipDir,
  validateRoots,
} from "./connector.mjs";

const TOKEN = `trk_${"Q".repeat(43)}`;
const dirs = [];
after(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

async function tempHome() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tc-home-"));
  dirs.push(dir);
  return dir;
}

describe("text and redaction", () => {
  it("strips control characters and caps length", () => {
    assert.equal(cleanText(" a\u0000b\nc ", 10), "ab c");
    assert.equal(cleanText("😀😀😀", 2), "😀😀");
    assert.equal(cleanText("   ", 5), null);
  });

  it("redacts tokens from any text", () => {
    assert.equal(redact(`failed with ${TOKEN}`, TOKEN), "failed with [REDACTED]");
    assert.equal(redact(`header trk_${"x".repeat(43)}`), "header trk_[REDACTED]");
  });
});

describe("remotes and repo identity", () => {
  it("drops credentials and normalises the URL", () => {
    const remote = scrubRemote("https://octo:s3cret@GitHub.com/Owner/Repo.git/");
    assert.equal(remote.display, "https://github.com/Owner/Repo");
    assert.ok(!remote.display.includes("s3cret"));
    assert.ok(!remote.identity.includes("octo"));
  });

  it("accepts scp-style remotes and drops the user part", () => {
    const remote = scrubRemote("git@github.com:owner/repo.git");
    assert.equal(remote.display, "https://github.com/owner/repo");
  });

  it("rejects unusable remotes", () => {
    assert.equal(scrubRemote("file:///srv/repo.git"), null);
    assert.equal(scrubRemote("not a remote"), null);
    assert.equal(scrubRemote(null), null);
  });

  it("gives the same id for https and ssh forms of one repo", () => {
    const https = scrubRemote("https://github.com/owner/repo.git");
    const ssh = scrubRemote("git@github.com:owner/repo.git");
    assert.equal(externalIdFor("/a", https), externalIdFor("/b", ssh));
  });

  it("falls back to the path when there is no remote", () => {
    assert.notEqual(externalIdFor("/home/you/a", null), externalIdFor("/home/you/b", null));
    assert.match(externalIdFor("/home/you/a", null), /^git-[0-9a-f]{40}$/);
  });
});

describe("path allowlist", () => {
  it("accepts folders under a root and the root itself", () => {
    assert.equal(isInsideRoot("/home/you/code/app", "/home/you/code"), true);
    assert.equal(isInsideRoot("/home/you/code", "/home/you/code"), true);
  });

  it("refuses escapes and look-alike sibling prefixes", () => {
    assert.equal(isPathAllowed("/home/you/code/../secrets", ["/home/you/code"]), false);
    assert.equal(isPathAllowed("/home/you/code2/app", ["/home/you/code"]), false);
    assert.equal(isPathAllowed("/etc/passwd", ["/home/you/code"]), false);
  });

  it("validates roots: absolute, under home, never the filesystem root or home", () => {
    const home = "/home/you";
    assert.deepEqual(validateRoots(["/home/you/code"], home), []);
    assert.ok(validateRoots(["/"], home).length > 0);
    assert.ok(validateRoots(["/home/you"], home).length > 0);
    assert.ok(validateRoots(["/srv/code"], home).length > 0);
    assert.ok(validateRoots(["code"], home).length > 0);
    assert.ok(validateRoots([], home).length > 0);
  });

  it("skips hidden folders and node_modules but not .git", () => {
    assert.equal(shouldSkipDir("node_modules"), true);
    assert.equal(shouldSkipDir(".cache"), true);
    assert.equal(shouldSkipDir(".hidden"), true);
    assert.equal(shouldSkipDir("src"), false);
  });
});

describe("repo discovery", () => {
  it("finds repos within the depth limit, does not search inside a repo, and skips node_modules", async () => {
    const home = await tempHome();
    const root = path.join(home, "code");
    await mkdir(path.join(root, "a", "b", "repo-depth3", ".git"), { recursive: true });
    await mkdir(path.join(root, "a", "b", "c", "too-deep", ".git"), { recursive: true });
    await mkdir(path.join(root, "outer", ".git"), { recursive: true });
    await mkdir(path.join(root, "outer", "inner", ".git"), { recursive: true });
    await mkdir(path.join(root, "node_modules", "pkg", ".git"), { recursive: true });
    const repos = await findRepos([root], 3);
    const names = repos.map((repo) => path.relative(root, repo));
    assert.ok(names.includes(path.join("a", "b", "repo-depth3")));
    assert.ok(!names.some((name) => name.includes("too-deep")));
    assert.ok(names.includes("outer"));
    assert.ok(!names.some((name) => name.includes("inner")));
    assert.ok(!names.some((name) => name.includes("node_modules")));
  });
});

describe("transcript and metadata parsing", () => {
  it("reads cwd, timestamp and model from a Claude Code transcript head and ignores message text", () => {
    const head = [
      JSON.stringify({ cwd: "/home/you/code/app", timestamp: "2026-11-15T09:00:00Z", message: { role: "user", content: "PRIVATE question" } }),
      "not json at all",
      JSON.stringify({ type: "assistant", message: { model: "model-x", content: "PRIVATE answer" } }),
    ].join("\n");
    const parsed = parseClaudeHead(head);
    assert.equal(parsed.cwd, "/home/you/code/app");
    assert.equal(parsed.model, "model-x");
    assert.equal(parsed.startedAt, "2026-11-15T09:00:00.000Z");
    assert.equal(JSON.stringify(parsed).includes("PRIVATE"), false);
  });

  it("reads Codex session metadata from the first line only", () => {
    const line = JSON.stringify({ type: "session_meta", timestamp: "2026-11-01T00:00:00Z", payload: { id: "0193f2a1-abcd", cwd: "/home/you/code/x", instructions: "long text" } });
    const meta = parseCodexFirstLine(line);
    assert.deepEqual(meta, { externalId: "0193f2a1-abcd", cwd: "/home/you/code/x", startedAt: "2026-11-01T00:00:00.000Z" });
    assert.equal(parseCodexFirstLine("{bad"), null);
    assert.equal(parseCodexFirstLine(JSON.stringify({ type: "message" })), null);
  });

  it("reads OpenCode metadata and keeps the title out unless asked", () => {
    const parsed = parseOpencodeSession({ id: "ses_1", directory: "/home/you/code/y", time: { created: 0, updated: 1000 }, title: "Auto title" });
    assert.equal(parsed.externalId, "ses_1");
    assert.equal(parsed.lastActivityAt, "1970-01-01T00:00:01.000Z");
    assert.equal(parseOpencodeSession({ time: {} }), null);
  });
});

describe("session items", () => {
  it("builds a whitelisted item with no title by default", () => {
    const item = sessionItem(
      { tool: "claude_code", externalId: "abc-1", cwd: "/home/you/code/app", title: "Secret title", startedAt: null, lastActivityAt: "2026-11-15T10:00:00.000Z", status: "historical", model: null },
      { repoPaths: ["/home/you/code/app"] },
    );
    assert.deepEqual(Object.keys(item).sort(), [
      "created_at", "cwd_hint", "external_id", "last_activity_at", "model", "project_hint", "resume_command", "status", "title",
    ].sort());
    assert.equal(item.title, null);
    assert.equal(item.project_hint, "/home/you/code/app");
    assert.equal(item.resume_command, "cd /home/you/code/app && claude --resume abc-1");
  });

  it("includes titles only when enabled", () => {
    const item = sessionItem({ tool: "opencode", externalId: "ses_2", cwd: null, title: "Named", status: "unknown" }, { sendTitles: true });
    assert.equal(item.title, "Named");
    assert.equal(item.resume_command, "opencode --session ses_2");
  });

  it("drops ids that would not be accepted", () => {
    assert.equal(sessionItem({ tool: "codex", externalId: "bad id", cwd: null }), null);
  });

  it("finds the longest repo that contains a folder", () => {
    assert.equal(projectHintFor("/a/b/c", ["/a", "/a/b"]), "/a/b");
    assert.equal(projectHintFor("/z", ["/a"]), null);
  });

  it("omits resume commands that fall outside the documented forms", () => {
    assert.equal(resumeCommandFor("claude_code", "x; rm -rf ~", null), null);
    assert.equal(resumeCommandFor("codex", "abc", "/has space"), "codex resume abc");
    assert.equal(resumeCommandFor("antigravity", "abc", null), null);
  });

  it("marks a session running only when a process of the same tool is in its exact folder", () => {
    const sessions = [
      { tool: "claude_code", externalId: "a", cwd: "/x" },
      { tool: "codex", externalId: "b", cwd: "/x" },
      { tool: "claude_code", externalId: "c", cwd: "/y" },
    ];
    const marked = markRunning(sessions, [{ tool: "claude_code", cwd: "/x" }]);
    assert.deepEqual(marked.map((s) => s.status), ["running_verified", "historical", "historical"]);
  });
});

describe("change detection and state", () => {
  const sessions = [
    { tool: "claude_code", externalId: "a", mtimeMs: 1, status: "historical" },
    { tool: "claude_code", externalId: "b", mtimeMs: 2, status: "historical" },
  ];

  it("sends new sessions, then only the ones whose file or status changed", () => {
    let state = emptyState();
    assert.equal(pendingSessions(sessions, state).length, 2);
    state = recordSentSessions(state, sessions);
    assert.equal(pendingSessions(sessions, state).length, 0);
    const changed = [{ ...sessions[0], mtimeMs: 9 }, sessions[1]];
    assert.deepEqual(pendingSessions(changed, state).map((s) => s.externalId), ["a"]);
  });

  it("does not modify the state object it was given", () => {
    const state = emptyState();
    const next = recordSentSessions(state, sessions);
    assert.deepEqual(state.sessions, {});
    assert.ok(next.sessions.claude_code.a);
  });

  it("chunks lists into groups of the given size", () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  });
});

describe("inventory entries", () => {
  it("matches the Projects inventory shape and omits a commit it cannot describe", () => {
    const project = inventoryProject({
      path: "/home/you/code/app",
      name: "app",
      remote: { display: "https://github.com/o/app", identity: "github.com/o/app" },
      branch: "main",
      last: null,
    });
    assert.equal(project.local_path, "/home/you/code/app");
    assert.equal(project.git.remote_url, "https://github.com/o/app");
    assert.equal(project.git.last_commit, null);
    assert.equal(project.git.current_branch, "main");
  });

  it("includes a last commit when sha and date are present", () => {
    const project = inventoryProject({
      path: "/home/you/code/app",
      name: "app",
      remote: null,
      branch: null,
      last: { sha: "a".repeat(40), subject: "Fix", at: "2026-11-15T10:00:00.000Z" },
    });
    assert.deepEqual(project.git.last_commit, { sha: "a".repeat(40), message: "Fix", at: "2026-11-15T10:00:00.000Z" });
  });
});

describe("configuration", () => {
  const home = "/home/you";
  const base = { serverUrl: "https://track.example.com", roots: ["/home/you/code"] };

  it("accepts a valid config and applies defaults", () => {
    const result = parseConfig(JSON.stringify(base), home);
    assert.equal(result.ok, true);
    assert.equal(result.config.maxDepth, 3);
    assert.deepEqual(result.config.tools, ["claude_code", "codex", "opencode"]);
    assert.equal(result.config.sendTitles, false);
  });

  it("refuses a token in the config file", () => {
    const result = parseConfig(JSON.stringify({ ...base, token: TOKEN }), home);
    assert.equal(result.ok, false);
    assert.match(result.errors.join(" "), /TRACK_CONNECTOR_TOKEN/);
  });

  it("requires https except for localhost", () => {
    assert.equal(checkServerUrl("https://track.example.com"), null);
    assert.equal(checkServerUrl("http://localhost:3000"), null);
    assert.ok(checkServerUrl("http://track.example.com"));
    assert.ok(checkServerUrl("not a url"));
  });

  it("refuses bad depths and unknown tools", () => {
    assert.equal(parseConfig(JSON.stringify({ ...base, maxDepth: 9 }), home).ok, false);
    assert.equal(parseConfig(JSON.stringify({ ...base, tools: ["emacs"] }), home).ok, false);
  });

  it("refuses non-JSON and non-object configs", () => {
    assert.equal(parseConfig("{", home).ok, false);
    assert.equal(parseConfig("[]", home).ok, false);
  });

  it("endpoints keep a path prefix on the server URL", () => {
    assert.equal(endpoint("https://host.example/track", "ping"), "https://host.example/track/api/integrations/ping");
    assert.equal(endpoint("https://host.example", "sessions"), "https://host.example/api/integrations/sessions");
  });
});

describe("requests and retries", () => {
  const noSleep = async () => {};

  it("retries a 503 and then succeeds", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return calls.length === 1 ? new Response("{}", { status: 503 }) : Response.json({ ok: true });
    };
    const reply = await requestJson({ serverUrl: "https://t.example", route: "ping", method: "GET", token: TOKEN, fetchImpl, delays: [1], sleep: noSleep });
    assert.deepEqual(reply, { ok: true });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].init.redirect, "error", "the token never follows a redirect");
  });

  it("does not retry a 401 and keeps the token out of the error", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response("{}", { status: 401 });
    };
    await assert.rejects(
      requestJson({ serverUrl: "https://t.example", route: "sessions", token: TOKEN, body: {}, fetchImpl, delays: [1, 1], sleep: noSleep }),
      (error) => {
        assert.equal(calls, 1);
        assert.equal(error.retryable, false);
        assert.ok(!error.message.includes(TOKEN));
        return true;
      },
    );
  });

  it("gives up after the retry budget on network errors", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      throw new TypeError("fetch failed");
    };
    await assert.rejects(
      requestJson({ serverUrl: "https://t.example", route: "ping", method: "GET", token: TOKEN, fetchImpl, delays: [1, 1], sleep: noSleep }),
      (error) => error.retryable === true && /after 3 attempts/.test(error.message),
    );
    assert.equal(calls, 3);
  });
});

describe("local readers never write", () => {
  it("reads Claude Code metadata and leaves the folder byte-identical", async () => {
    const home = await tempHome();
    const projects = path.join(home, ".claude", "projects", "-home-you-code-app");
    await mkdir(projects, { recursive: true });
    const file = path.join(projects, "11111111-2222-3333-4444-555555555555.jsonl");
    const body = JSON.stringify({ cwd: "/home/you/code/app", timestamp: "2026-11-15T09:00:00Z", message: { content: "PRIVATE" } });
    await writeFile(file, `${body}\n`);
    const before = await stat(file);

    const result = await collectSessions("claude_code", { home });
    assert.equal(result.status, "ok");
    assert.equal(result.sessions.length, 1);
    assert.equal(result.sessions[0].externalId, "11111111-2222-3333-4444-555555555555");
    assert.equal(JSON.stringify(result).includes("PRIVATE"), false);

    const after = await stat(file);
    assert.equal(after.mtimeMs, before.mtimeMs);
    assert.equal(await readFile(file, "utf8"), `${body}\n`);
  });

  it("reports missing folders and unsupported tools without failing", async () => {
    const home = await tempHome();
    assert.equal((await collectSessions("codex", { home })).status, "not_found");
    assert.equal((await collectSessions("antigravity", { home })).status, "unsupported");
  });

  it("builds a plan from real folders without sending anything", async () => {
    const home = await tempHome();
    const repo = path.join(home, "code", "app");
    await mkdir(path.join(repo, ".git"), { recursive: true });
    const config = { serverUrl: "https://t.example", roots: [path.join(home, "code")], maxDepth: 3, tools: ["claude_code"], sendTitles: false };
    const plan = await buildPlan({ config, home, state: emptyState(), full: true, generatedAt: "2026-11-15T10:00:00.000Z" });
    assert.equal(plan.inventory.length, 1);
    assert.equal(plan.inventory[0].projects[0].local_path, repo);
    assert.equal(plan.batches.length, 0, "no sessions in the empty fixture");
  });
});

describe("command line", () => {
  it("parses commands and flags", () => {
    assert.deepEqual(parseArgs(["once", "--dry-run", "--config", "/x.json"]), { command: "once", config: "/x.json", dryRun: true, help: false });
    assert.match(parseArgs(["once", "--wat"]).error, /unknown argument/);
  });

  it("push without a token exits 2 before any network call", async () => {
    const home = await tempHome();
    const config = path.join(home, "config.json");
    await writeFile(config, JSON.stringify({ serverUrl: "https://t.example", roots: [path.join(home, "code")] }));
    const errors = [];
    const code = await main(["push", "--config", config], {
      env: {},
      home,
      io: { stdout: { write() {} }, stderr: { write: (text) => errors.push(text) } },
      fetchImpl: async () => {
        throw new Error("network must not be used");
      },
    });
    assert.equal(code, 2);
    assert.match(errors.join(""), /TRACK_CONNECTOR_TOKEN/);
  });

  it("dry-run prints payloads, sends nothing and writes no state", async () => {
    const home = await tempHome();
    await mkdir(path.join(home, "code", "app", ".git"), { recursive: true });
    const config = path.join(home, "config.json");
    await writeFile(config, JSON.stringify({ serverUrl: "https://t.example", roots: [path.join(home, "code")] }));
    const out = [];
    const code = await main(["once", "--dry-run", "--config", config], {
      env: { TRACK_CONNECTOR_STATE: path.join(home, "state.json") },
      home,
      io: { stdout: { write: (text) => out.push(text) }, stderr: { write() {} } },
      fetchImpl: async () => {
        throw new Error("dry-run must not send");
      },
    });
    assert.equal(code, 0);
    const printed = JSON.parse(out.join(""));
    assert.equal(printed.inventory[0].version, 1);
    await assert.rejects(stat(path.join(home, "state.json")));
  });

  it("refuses a root that resolves outside home", async () => {
    const home = await tempHome();
    const config = path.join(home, "config.json");
    await writeFile(config, JSON.stringify({ serverUrl: "https://t.example", roots: ["/etc"] }));
    const errors = [];
    const code = await main(["scan", "--config", config], {
      env: {},
      home,
      io: { stdout: { write() {} }, stderr: { write: (text) => errors.push(text) } },
    });
    assert.equal(code, 2);
    assert.match(errors.join(""), /inside your home/);
  });
});
