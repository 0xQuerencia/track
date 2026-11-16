import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { createToken, revokeToken, type IntegrationScope } from "@/lib/security/integration-tokens";
import { openSessionsTestDb, useAsAppDb } from "@/lib/sessions/test-support";
import { GET as ping } from "./ping/route";
import { POST as postSessions } from "./sessions/route";
import { POST as postInventory } from "./inventory/route";

let db: DatabaseSync;

beforeEach(() => {
  db = openSessionsTestDb();
  useAsAppDb(db);
});

afterEach(() => {
  useAsAppDb(undefined);
  db.close();
});

/** Every test uses its own client address so the failed-attempt limiter starts clean. */
let clientSeq = 0;
const nextIp = () => `198.51.100.${(clientSeq++ % 200) + 1}`;

function token(scopes: IntegrationScope[], label = "test"): string {
  return createToken(db, label, scopes).token;
}

function sessionsBody(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 1,
    source: "connector",
    tool: "claude_code",
    sessions: [{ external_id: "route-one", title: "Route test", last_activity_at: "2026-11-15T08:00:00Z" }],
    ...extra,
  });
}

function postRequest(path: string, body: BodyInit, bearer?: string, headers: Record<string, string> = {}): Request {
  const all: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": nextIp(),
    ...headers,
  };
  if (bearer) all.authorization = `Bearer ${bearer}`;
  return new Request(`http://track.test${path}`, { method: "POST", body, headers: all, duplex: "half" } as RequestInit);
}

function getRequest(path: string, bearer?: string): Request {
  const headers: Record<string, string> = { "x-forwarded-for": nextIp() };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return new Request(`http://track.test${path}`, { headers });
}

describe("token checks on every connector route", () => {
  it("answers 401 without a token and 401 for a made-up token", async () => {
    const none = await ping(getRequest("/api/integrations/ping"));
    assert.equal(none.status, 401);
    const fake = await ping(getRequest("/api/integrations/ping", `trk_${"A".repeat(43)}`));
    assert.equal(fake.status, 401);
  });

  it("answers 401 for a revoked token", async () => {
    const created = createToken(db, "gone", ["metadata:write"]);
    revokeToken(db, created.id);
    const response = await ping(getRequest("/api/integrations/ping", created.token));
    assert.equal(response.status, 401);
  });

  it("answers 403 when the token lacks the route's scope", async () => {
    const sessionsOnly = token(["sessions:write"]);
    const response = await ping(getRequest("/api/integrations/ping", sessionsOnly));
    assert.equal(response.status, 403);
  });

  it("refuses sessions writes with a projects-only token", async () => {
    const projectsOnly = token(["projects:write"]);
    const response = await postSessions(postRequest("/api/integrations/sessions", sessionsBody(), projectsOnly));
    assert.equal(response.status, 403);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ai_sessions").get()?.n, 0);
  });
});

describe("GET /api/integrations/ping", () => {
  it("returns server time with a metadata:write token and no data", async () => {
    const response = await ping(getRequest("/api/integrations/ping", token(["metadata:write"])));
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean; server_time: string };
    assert.equal(body.ok, true);
    assert.ok(!Number.isNaN(Date.parse(body.server_time)));
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});

describe("POST /api/integrations/sessions", () => {
  it("stores a valid batch and reports the counts", async () => {
    const response = await postSessions(postRequest("/api/integrations/sessions", sessionsBody(), token(["sessions:write"])));
    assert.equal(response.status, 200);
    const body = (await response.json()) as { created: number; received: number };
    assert.equal(body.created, 1);
    assert.equal(body.received, 1);
    const stored = db.prepare("SELECT title FROM ai_sessions WHERE external_id = 'route-one'").get() as { title: string };
    assert.equal(stored.title, "Route test");
  });

  it("is idempotent across repeated posts", async () => {
    const bearer = token(["sessions:write"]);
    await postSessions(postRequest("/api/integrations/sessions", sessionsBody(), bearer));
    const again = await postSessions(postRequest("/api/integrations/sessions", sessionsBody(), bearer));
    const body = (await again.json()) as { created: number; unchanged: number };
    assert.equal(body.created, 0);
    assert.equal(body.unchanged, 1);
  });

  it("refuses a body that is not JSON content", async () => {
    const response = await postSessions(
      postRequest("/api/integrations/sessions", sessionsBody(), token(["sessions:write"]), {
        "content-type": "text/plain",
      }),
    );
    assert.equal(response.status, 415);
  });

  it("refuses a declared body over 2 MB before reading it", async () => {
    const response = await postSessions(
      postRequest("/api/integrations/sessions", sessionsBody(), token(["sessions:write"]), {
        "content-length": String(3 * 1024 * 1024),
      }),
    );
    assert.equal(response.status, 413);
  });

  it("refuses a streamed body over 2 MB even without a Content-Length", async () => {
    const chunk = new TextEncoder().encode(" ".repeat(1024 * 1024));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 3; i++) controller.enqueue(chunk);
        controller.close();
      },
    });
    const request = new Request("http://track.test/api/integrations/sessions", {
      method: "POST",
      body: stream,
      duplex: "half",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token(["sessions:write"])}`,
        "x-forwarded-for": nextIp(),
      },
    } as RequestInit);
    const response = await postSessions(request);
    assert.equal(response.status, 413);
  });

  it("answers 400 for invalid JSON", async () => {
    const response = await postSessions(
      postRequest("/api/integrations/sessions", "{nope", token(["sessions:write"])),
    );
    assert.equal(response.status, 400);
  });

  it("rejects a transcript-like field and stores nothing", async () => {
    const body = sessionsBody({
      sessions: [{ external_id: "leaky", transcript: "the user said something private" }],
    });
    const response = await postSessions(postRequest("/api/integrations/sessions", body, token(["sessions:write"])));
    assert.equal(response.status, 400);
    const text = await response.text();
    assert.doesNotMatch(text, /private/, "the error never echoes the submitted text");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ai_sessions").get()?.n, 0);
  });

  it("sends no CORS headers and never echoes the token", async () => {
    const bearer = token(["sessions:write"]);
    const response = await postSessions(
      postRequest("/api/integrations/sessions", sessionsBody(), bearer, { origin: "https://evil.example" }),
    );
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.ok(!(await response.text()).includes(bearer));
  });

  it("returns 403 when the integration is disabled", async () => {
    db.prepare(`UPDATE integrations SET enabled = 0 WHERE "key" = 'claude_code'`).run();
    const response = await postSessions(postRequest("/api/integrations/sessions", sessionsBody(), token(["sessions:write"])));
    assert.equal(response.status, 403);
  });
});

describe("POST /api/integrations/inventory", () => {
  it("refuses a token without projects:write", async () => {
    const response = await postInventory(
      postRequest("/api/integrations/inventory", "{}", token(["sessions:write"])),
    );
    assert.equal(response.status, 403);
  });

  it("answers with a short JSON error and no stack for a bad envelope", async () => {
    const response = await postInventory(
      postRequest("/api/integrations/inventory", JSON.stringify({ version: 9 }), token(["projects:write"])),
    );
    assert.notEqual(response.status, 500);
    assert.doesNotMatch(await response.text(), /at .*\.ts:\d+/);
  });
});

describe("failed-attempt and request limits", () => {
  it("locks an address after repeated bad tokens", async () => {
    const ip = "203.0.113.77";
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const response = await ping(
        new Request("http://track.test/api/integrations/ping", {
          headers: { authorization: `Bearer trk_${"B".repeat(43)}`, "x-forwarded-for": ip },
        }),
      );
      statuses.push(response.status);
    }
    assert.equal(statuses.slice(0, 10).every((s) => s === 401), true);
    assert.equal(statuses[11], 429);
  });

  it("limits a single token's request rate", async () => {
    const bearer = token(["metadata:write"], "busy");
    let limited = false;
    for (let i = 0; i < 200 && !limited; i++) {
      const response = await ping(getRequest("/api/integrations/ping", bearer));
      if (response.status === 429) limited = true;
    }
    assert.equal(limited, true);
  });
});
