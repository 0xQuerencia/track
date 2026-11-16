import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  INTEGRATION_TOKENS_SQL,
  createToken,
  revokeToken,
  tokenFromAuthorization,
  verifyToken,
} from "./integration-tokens";

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(INTEGRATION_TOKENS_SQL);
});

describe("createToken", () => {
  it("returns a trk_ token of 32 random bytes in base64url", () => {
    const created = createToken(db, "phone", ["sessions:write"]);
    assert.match(created.token, /^trk_[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(created.scopes, ["sessions:write"]);
    assert.equal(created.label, "phone");
  });

  it("never stores the raw token, only its hash", () => {
    const created = createToken(db, "phone", ["sessions:write"]);
    const rows = db.prepare("SELECT * FROM integration_tokens").all();
    const serialised = JSON.stringify(rows, (_k, v: unknown) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    assert.equal(serialised.includes(created.token), false);
    assert.equal(serialised.includes(created.token.slice(4)), false);
  });

  it("issues distinct tokens", () => {
    const a = createToken(db, "a", ["metadata:write"]);
    const b = createToken(db, "b", ["metadata:write"]);
    assert.notEqual(a.token, b.token);
    assert.notEqual(a.id, b.id);
  });

  it("normalises scopes, dropping duplicates and ordering them canonically", () => {
    const created = createToken(db, "x", [
      "metadata:write",
      "sessions:write",
      "metadata:write",
    ]);
    assert.deepEqual(created.scopes, ["sessions:write", "metadata:write"]);
  });

  it("rejects empty or overlong labels, empty scope lists and unknown scopes", () => {
    assert.throws(() => createToken(db, "   ", ["sessions:write"]), RangeError);
    assert.throws(() => createToken(db, "x".repeat(81), ["sessions:write"]), RangeError);
    assert.throws(() => createToken(db, "x", []), RangeError);
    assert.throws(
      () => createToken(db, "x", ["admin:*" as never]),
      RangeError,
    );
  });
});

describe("verifyToken", () => {
  it("accepts a valid token with the required scope and stamps last_used_at", () => {
    const created = createToken(db, "phone", ["sessions:write"]);
    const result = verifyToken(db, created.token, "sessions:write");
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.label, "phone");
    const row = db
      .prepare("SELECT last_used_at FROM integration_tokens WHERE id = ?")
      .get(created.id);
    assert.notEqual(row?.last_used_at, null);
  });

  it("rejects a token lacking the required scope", () => {
    const created = createToken(db, "phone", ["sessions:write"]);
    assert.deepEqual(verifyToken(db, created.token, "projects:write"), {
      ok: false,
      reason: "scope",
    });
  });

  it("rejects unknown, malformed and missing tokens", () => {
    createToken(db, "phone", ["sessions:write"]);
    const unknown = "trk_" + "a".repeat(43);
    assert.deepEqual(verifyToken(db, unknown, "sessions:write"), {
      ok: false,
      reason: "invalid",
    });
    for (const bad of ["", "trk_short", "Bearer trk_x", "sk-123", null, undefined]) {
      assert.deepEqual(verifyToken(db, bad, "sessions:write"), {
        ok: false,
        reason: "invalid",
      });
    }
  });

  it("rejects a revoked token, and revoking twice reports no change", () => {
    const created = createToken(db, "phone", ["sessions:write"]);
    assert.equal(revokeToken(db, created.id), true);
    assert.deepEqual(verifyToken(db, created.token, "sessions:write"), {
      ok: false,
      reason: "revoked",
    });
    assert.equal(revokeToken(db, created.id), false);
    assert.equal(revokeToken(db, 999_999), false);
  });
});

describe("tokenFromAuthorization", () => {
  it("extracts the raw token from a Bearer header", () => {
    assert.equal(tokenFromAuthorization("Bearer trk_abc "), "trk_abc");
    assert.equal(tokenFromAuthorization("Basic abc"), null);
    assert.equal(tokenFromAuthorization(null), null);
  });
});
