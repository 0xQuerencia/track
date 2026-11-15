import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { openSessionsTestDb } from "../sessions/test-support";
import { STALE_AFTER_MS } from "./catalog";
import {
  finishRun,
  getIntegration,
  listIntegrations,
  markError,
  markSuccess,
  pruneRuns,
  recentRuns,
  setEnabled,
  setStoreSummaries,
  shownStatus,
  startRun,
} from "./store";
import { createIntegrationToken, listTokens, revokeIntegrationToken } from "./tokens";
import { recordPing } from "./ingest";

let db: DatabaseSync;

beforeEach(() => {
  db = openSessionsTestDb();
});

afterEach(() => {
  db.close();
});

const NOW = "2026-11-15T12:00:00.000Z";

describe("shownStatus", () => {
  it("turns Connected into Stale after a day without a success", () => {
    const old = new Date(Date.parse(NOW) - STALE_AFTER_MS - 1000).toISOString();
    const fresh = new Date(Date.parse(NOW) - 60_000).toISOString();
    assert.equal(shownStatus("Connected", old, NOW), "Stale");
    assert.equal(shownStatus("Connected", fresh, NOW), "Connected");
  });

  it("leaves other statuses alone", () => {
    assert.equal(shownStatus("Error", null, NOW), "Error");
    assert.equal(shownStatus("Not connected", null, NOW), "Not connected");
  });
});

describe("integration state", () => {
  it("lists the seven integrations in order with their labels and privacy defaults", () => {
    const rows = listIntegrations(db, NOW);
    assert.deepEqual(
      rows.map((r) => r.key),
      ["local_linux", "git", "github", "claude_code", "codex", "opencode", "antigravity"],
    );
    assert.equal(rows[3].label, "Claude Code");
    assert.deepEqual(rows[3].privacy, { store_summaries: false });
    assert.equal(rows[6].enabled, false, "antigravity is off: it is unsupported");
  });

  it("turns Stale on read when the last success is old", () => {
    markSuccess(db, "git", "2026-11-01T00:00:00.000Z");
    const row = getIntegration(db, "git", NOW);
    assert.equal(row?.storedStatus, "Connected");
    assert.equal(row?.status, "Stale");
  });

  it("records an error without clearing the last success", () => {
    markSuccess(db, "git", "2026-11-14T00:00:00.000Z");
    markError(db, "git", NOW, "Token=trk_abcdef0123456789abcdef0123456789abcdef0123456 failed");
    const row = getIntegration(db, "git", NOW);
    assert.equal(row?.status, "Error");
    assert.equal(row?.lastSuccessAt, "2026-11-14T00:00:00.000Z");
    assert.doesNotMatch(row?.lastError ?? "", /abcdef0123456789/, "the error is redacted");
  });

  it("toggles enabled and the store-summaries privacy flag, keeping other keys", () => {
    setEnabled(db, "codex", false, NOW);
    assert.equal(getIntegration(db, "codex", NOW)?.enabled, false);
    db.prepare(`UPDATE integrations SET privacy = '{"store_summaries":false,"other":1}' WHERE "key" = 'codex'`).run();
    setStoreSummaries(db, "codex", true, NOW);
    const row = getIntegration(db, "codex", NOW);
    assert.equal(row?.privacy.store_summaries, true);
    const raw = db.prepare(`SELECT privacy FROM integrations WHERE "key" = 'codex'`).get() as { privacy: string };
    assert.equal(JSON.parse(raw.privacy).other, 1);
  });

  it("keeps only the newest runs per integration", () => {
    for (let i = 0; i < 205; i++) {
      const id = startRun(db, "claude_code", "connector", `2026-11-15T00:00:${String(i % 60).padStart(2, "0")}Z`);
      finishRun(db, id, { finishedAt: NOW, ok: true, received: i, changed: 0, error: null });
    }
    pruneRuns(db, "claude_code");
    const count = db.prepare("SELECT COUNT(*) AS n FROM sync_runs WHERE integration_key = 'claude_code'").get() as { n: number };
    assert.equal(Number(count.n), 200);
    assert.equal(recentRuns(db, "claude_code", 5)[0].itemsReceived, 204);
  });

  it("records a ping as a Linux connector success", () => {
    const result = recordPing(db);
    assert.ok(result.ok);
    assert.equal(getIntegration(db, "local_linux")?.status, "Connected");
  });

  it("refuses a ping while the Linux connector is disabled", () => {
    setEnabled(db, "local_linux", false, NOW);
    const result = recordPing(db);
    assert.deepEqual(result.ok ? null : result.status, 403);
  });
});

describe("integration tokens for Settings", () => {
  it("creates a token, lists it without the secret, and revokes it", () => {
    const created = createIntegrationToken(db, "  Linux laptop  ", ["sessions:write", "metadata:write"]);
    assert.ok(created.ok);
    if (!created.ok) return;
    assert.match(created.token, /^trk_/);
    assert.equal(created.label, "Linux laptop");

    const rows = listTokens(db);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].scopes, ["sessions:write", "metadata:write"]);
    assert.doesNotMatch(JSON.stringify(rows), /trk_|token_hash/);

    assert.equal(revokeIntegrationToken(db, rows[0].id), true);
    assert.notEqual(listTokens(db)[0].revokedAt, null);
  });

  it("rejects an empty label, no scopes and unknown scopes", () => {
    assert.equal(createIntegrationToken(db, "   ", ["sessions:write"]).ok, false);
    assert.equal(createIntegrationToken(db, "x", []).ok, false);
    assert.equal(createIntegrationToken(db, "x", ["admin:everything"]).ok, false);
  });
});
