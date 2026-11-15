import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { closeTestDb, installTestDb } from "@/lib/testing/test-db";
import { createToken } from "@/lib/security/integration-tokens";
import { POST as postInventory } from "./inventory/route";
import { POST as postSessions } from "./sessions/route";

/*
 * Cross-module contract with the Projects feature, on the full migration
 * registry: an inventory push creates the project, and a session whose folder
 * matches that project's local path is linked with a session_of record link
 * (the form that src/lib/projects/sessions.ts reads).
 */

let db: DatabaseSync;

beforeEach(() => {
  db = installTestDb();
});

afterEach(() => {
  closeTestDb();
});

function post(path: string, bearer: string, body: unknown): Request {
  return new Request(`http://track.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${bearer}`, "x-forwarded-for": "192.0.2.50" },
    body: JSON.stringify(body),
  });
}

describe("connector handoff to Projects", () => {
  it("creates the project from inventory and links a matching session to it", async () => {
    const bearer = createToken(db, "handoff", ["projects:write", "sessions:write"]).token;

    const inventory = await postInventory(
      post("/api/integrations/inventory", bearer, {
        version: 1,
        generated_at: "2026-11-15T09:00:00Z",
        projects: [
          {
            external_id: "git-handoff-1",
            name: "Handoff App",
            local_path: "/home/you/code/handoff",
            git: { remote_url: "https://github.com/owner/handoff", current_branch: "main" },
          },
        ],
      }),
    );
    assert.equal(inventory.status, 200);

    const sessions = await postSessions(
      post("/api/integrations/sessions", bearer, {
        version: 1,
        source: "connector",
        tool: "codex",
        sessions: [
          {
            external_id: "handoff-session-1",
            cwd_hint: "/home/you/code/handoff",
            project_hint: "/home/you/code/handoff",
            last_activity_at: "2026-11-15T09:30:00Z",
          },
        ],
      }),
    );
    const reply = (await sessions.json()) as { linked: number };
    assert.equal(sessions.status, 200);
    assert.equal(reply.linked, 1);

    const project = db.prepare("SELECT id FROM projects WHERE external_id = 'git-handoff-1'").get() as { id: number };
    const session = db.prepare("SELECT id, project_id FROM ai_sessions WHERE external_id = 'handoff-session-1'").get() as {
      id: number;
      project_id: number;
    };
    assert.equal(session.project_id, project.id);
    const link = db
      .prepare("SELECT from_type, from_id, to_type, to_id, relation FROM record_links WHERE to_type = 'ai_session'")
      .get() as Record<string, string>;
    assert.deepEqual(
      { ...link },
      {
        from_type: "projects",
        from_id: String(project.id),
        to_type: "ai_session",
        to_id: String(session.id),
        relation: "session_of",
      },
    );
  });
});
