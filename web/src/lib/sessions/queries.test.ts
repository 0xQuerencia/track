import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { importSessions } from "./import";
import { openSessionsTestDb } from "./test-support";
import {
  backlogForProject,
  countSessions,
  dashboardStats,
  getSessionDetail,
  listGroups,
  listSessionPage,
  projectOptions,
} from "./queries";
import { escapeLike, filtersToQuery, parseSessionFilters, type SessionFilters } from "./filters";
import { chooseProject } from "./store";

let db: DatabaseSync;

beforeEach(() => {
  db = openSessionsTestDb();
});

afterEach(() => {
  db.close();
});

const base: SessionFilters = {
  tool: null,
  status: null,
  linked: null,
  project: null,
  q: "",
  sort: "recent",
  group: "none",
  page: 1,
};

type Seed = { id: string; tool?: string; activity?: string; title?: string; cwd?: string; status?: string };

function seed(items: Seed[]): void {
  for (const item of items) {
    importSessions(
      db,
      {
        version: 1,
        source: "connector",
        tool: item.tool ?? "claude_code",
        sessions: [
          {
            external_id: item.id,
            title: item.title ?? `Session ${item.id}`,
            cwd_hint: item.cwd ?? `/home/you/code/${item.id}`,
            last_activity_at: item.activity ?? "2026-11-10T10:00:00Z",
            status: item.status ?? "historical",
          },
        ],
      },
      "connector",
    );
  }
}

function projectRow(name: string, localPath: string): number {
  return Number(
    db
      .prepare("INSERT INTO projects (name, local_path) VALUES (?, ?)")
      .run(name, localPath).lastInsertRowid,
  );
}

describe("parseSessionFilters", () => {
  it("drops values outside the fixed lists", () => {
    const parsed = parseSessionFilters({
      tool: "rm -rf",
      status: "running",
      sort: "drop table",
      group: "everything",
      linked: "maybe",
      project: "1 OR 1=1",
      page: "-4",
    });
    assert.deepEqual(parsed, {
      tool: null,
      status: null,
      linked: null,
      project: null,
      q: "",
      sort: "recent",
      group: "none",
      page: 1,
    });
  });

  it("accepts known values and a numeric project", () => {
    const parsed = parseSessionFilters({ tool: "codex", project: "7", linked: "no", page: "3" });
    assert.equal(parsed.tool, "codex");
    assert.equal(parsed.project, 7);
    assert.equal(parsed.linked, "no");
    assert.equal(parsed.page, 3);
  });

  it("keeps project=none as a value", () => {
    assert.equal(parseSessionFilters({ project: "none" }).project, "none");
  });

  it("rebuilds a query string with only non-default values", () => {
    assert.equal(filtersToQuery({ ...base, tool: "codex", page: 2 }), "?tool=codex&page=2");
    assert.equal(filtersToQuery(base), "");
  });
});

describe("escapeLike", () => {
  it("escapes percent, underscore and backslash", () => {
    assert.equal(escapeLike("50%_off\\"), "50\\%\\_off\\\\");
  });
});

describe("explorer queries", () => {
  it("paginates 50 rows per page, newest first", () => {
    const items = Array.from({ length: 120 }, (_, i) => ({
      id: `s${String(i).padStart(3, "0")}`,
      activity: new Date(Date.UTC(2026, 0, 1) + i * 3600_000).toISOString(),
    }));
    seed(items);
    assert.equal(countSessions(db, base), 120);
    const first = listSessionPage(db, base);
    const second = listSessionPage(db, { ...base, page: 2 });
    const third = listSessionPage(db, { ...base, page: 3 });
    assert.equal(first.length, 50);
    assert.equal(second.length, 50);
    assert.equal(third.length, 20);
    assert.equal(first[0].externalId, "s119", "newest first");
    assert.equal(new Set([...first, ...second, ...third].map((r) => r.id)).size, 120);
  });

  it("filters by tool and status", () => {
    seed([
      { id: "a", tool: "claude_code", status: "running_verified" },
      { id: "b", tool: "codex", status: "historical" },
      { id: "c", tool: "codex", status: "running_verified" },
    ]);
    assert.equal(countSessions(db, { ...base, tool: "codex" }), 2);
    assert.equal(countSessions(db, { ...base, status: "running_verified" }), 2);
    assert.equal(countSessions(db, { ...base, tool: "codex", status: "running_verified" }), 1);
  });

  it("matches text search literally, so wildcards do not match everything", () => {
    seed([{ id: "alpha", title: "Refactor auth" }, { id: "beta", title: "100% done" }]);
    assert.equal(countSessions(db, { ...base, q: "%" }), 1);
    assert.equal(countSessions(db, { ...base, q: "_" }), 0);
    assert.equal(countSessions(db, { ...base, q: "auth" }), 1);
    assert.equal(countSessions(db, { ...base, q: "beta" }), 1);
  });

  it("separates linked and unlinked sessions", () => {
    seed([{ id: "x" }, { id: "y" }]);
    const projectId = projectRow("Assistant", "/home/you/code/assistant");
    const x = db.prepare("SELECT id FROM ai_sessions WHERE external_id = 'x'").get() as { id: number };
    chooseProject(db, Number(x.id), projectId);
    assert.equal(countSessions(db, { ...base, linked: "yes" }), 1);
    assert.equal(countSessions(db, { ...base, linked: "no" }), 1);
    assert.equal(countSessions(db, { ...base, project: projectId }), 1);
    assert.equal(countSessions(db, { ...base, project: "none" }), 1);
  });

  it("sorts by title when asked", () => {
    seed([{ id: "1", title: "Zebra" }, { id: "2", title: "apple" }]);
    const rows = listSessionPage(db, { ...base, sort: "title" });
    assert.deepEqual(rows.map((r) => r.title), ["apple", "Zebra"]);
  });
});

describe("grouped view", () => {
  it("groups by tool with counts and a short preview per group", () => {
    seed([
      { id: "a1", tool: "claude_code" },
      { id: "a2", tool: "claude_code" },
      { id: "b1", tool: "codex" },
    ]);
    const page = listGroups(db, { ...base, group: "tool" }, "tool");
    const claude = page.groups.find((g) => g.key === "claude_code");
    assert.equal(page.totalGroups, 2);
    assert.equal(claude?.count, 2);
    assert.equal(claude?.preview.length, 2);
  });

  it("groups by project, with an unlinked group", () => {
    seed([{ id: "p1" }, { id: "p2" }]);
    const projectId = projectRow("Games", "/home/you/code/games");
    const p1 = db.prepare("SELECT id FROM ai_sessions WHERE external_id = 'p1'").get() as { id: number };
    chooseProject(db, Number(p1.id), projectId);
    const page = listGroups(db, base, "project");
    const linked = page.groups.find((g) => g.key === String(projectId));
    const none = page.groups.find((g) => g.key === "none");
    assert.equal(linked?.label, "Games");
    assert.equal(none?.label, "No project");
    assert.equal(none?.count, 1);
  });
});

describe("dashboard stats", () => {
  it("counts from real rows: totals, status, unlinked, tools and recent activity", () => {
    seed([
      { id: "r1", tool: "claude_code", status: "running_verified", activity: "2026-11-14T10:00:00Z" },
      { id: "r2", tool: "codex", status: "historical", activity: "2026-10-01T10:00:00Z" },
    ]);
    const stats = dashboardStats(db, "2026-11-15T12:00:00Z");
    assert.equal(stats.total, 2);
    assert.deepEqual(stats.byStatus, { historical: 1, running_verified: 1, unknown: 0 });
    assert.equal(stats.unlinked, 2);
    assert.equal(stats.activeLastWeek, 1);
    assert.equal(stats.byTool.length, 2);
    assert.equal(stats.recent[0].externalId, "r1");
  });

  it("is empty, not invented, with no sessions", () => {
    const stats = dashboardStats(db, "2026-11-15T12:00:00Z");
    assert.equal(stats.total, 0);
    assert.deepEqual(stats.recent, []);
  });
});

describe("detail and options", () => {
  it("returns the detail with its project name, or null when missing", () => {
    seed([{ id: "d1", cwd: "/home/you/code/d1" }]);
    const row = db.prepare("SELECT id FROM ai_sessions WHERE external_id = 'd1'").get() as { id: number };
    const projectId = projectRow("Detail project", "/home/you/code/detail");
    chooseProject(db, Number(row.id), projectId);
    const detail = getSessionDetail(db, Number(row.id));
    assert.equal(detail?.projectName, "Detail project");
    assert.equal(detail?.projectLinkSource, "manual");
    assert.equal(getSessionDetail(db, 999999), null);
  });

  it("lists project options and backlog by project name", () => {
    projectRow("Zed", "/z");
    projectRow("alpha", "/a");
    assert.deepEqual(projectOptions(db).map((p) => p.name), ["alpha", "Zed"]);
    db.prepare("INSERT INTO project_items (project, title, status) VALUES ('alpha', 'Ship it', 'Doing')").run();
    assert.equal(backlogForProject(db, "alpha")[0].title, "Ship it");
    assert.deepEqual(backlogForProject(db, "nobody"), []);
  });
});
