import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  createSessionToken,
  passwordMatches,
  readSessionConfig,
  verifySessionToken,
  type SessionEnv,
} from "./session";

const PASSWORD = "correct horse battery staple";
const SECRET = "s".repeat(32);
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

/** A cookie exactly as the pre-v2 code issued it: expires.hex(HMAC(password-key, expires)). */
function legacyCookie(password: string, expires: number): string {
  const key = createHash("sha256").update(`${password}:track-session`).digest();
  const signature = createHmac("sha256", key).update(String(expires)).digest("hex");
  return `${expires}.${signature}`;
}

const env = (extra: SessionEnv = {}): SessionEnv => ({
  TRACK_PASSWORD: PASSWORD,
  ...extra,
});

describe("readSessionConfig", () => {
  it("fails closed without a password", () => {
    assert.equal(readSessionConfig({}).ok, false);
  });

  it("rejects a secret shorter than 32 characters", () => {
    assert.equal(readSessionConfig(env({ TRACK_SESSION_SECRET: "short" })).ok, false);
  });

  it("rejects a non-integer epoch", () => {
    assert.equal(readSessionConfig(env({ TRACK_SESSION_EPOCH: "1.5" })).ok, false);
    assert.equal(readSessionConfig(env({ TRACK_SESSION_EPOCH: "-1" })).ok, false);
  });

  it("defaults epoch to 0 and keeps legacy sessions accepted", () => {
    const result = readSessionConfig(env());
    assert.deepEqual(result.ok && result.config, {
      password: PASSWORD,
      secret: null,
      epoch: 0,
      acceptLegacy: true,
    });
  });
});

describe("session tokens", () => {
  it("issues v2 tokens that verify under the secret", async () => {
    const token = await createSessionToken(env({ TRACK_SESSION_SECRET: SECRET }), NOW);
    assert.ok(token);
    assert.ok(token.startsWith("v2.0."));
    assert.equal(await verifySessionToken(token, env({ TRACK_SESSION_SECRET: SECRET }), NOW), true);
  });

  it("issues no token without a password", async () => {
    assert.equal(await createSessionToken({}, NOW), null);
    assert.equal(await verifySessionToken("anything", {}, NOW), false);
  });

  it("keeps the password-derived cookie format valid during the transition", async () => {
    const cookie = legacyCookie(PASSWORD, NOW + DAY);
    assert.equal(await verifySessionToken(cookie, env(), NOW), true);
    assert.equal(
      await verifySessionToken(cookie, env({ TRACK_SESSION_SECRET: SECRET }), NOW),
      true,
      "legacy cookies still work once a secret is configured",
    );
  });

  it("stops accepting legacy cookies once TRACK_LEGACY_SESSIONS=0", async () => {
    const cookie = legacyCookie(PASSWORD, NOW + DAY);
    const strict = env({ TRACK_SESSION_SECRET: SECRET, TRACK_LEGACY_SESSIONS: "0" });
    assert.equal(await verifySessionToken(cookie, strict, NOW), false);
  });

  it("survives a password change when a secret is set, but not for legacy cookies", async () => {
    const withSecret = env({ TRACK_SESSION_SECRET: SECRET, TRACK_LEGACY_SESSIONS: "0" });
    const token = await createSessionToken(withSecret, NOW);
    assert.ok(token);
    const rotated = { ...withSecret, TRACK_PASSWORD: "a different password" };
    assert.equal(await verifySessionToken(token, rotated, NOW), true);
    assert.equal(
      await verifySessionToken(legacyCookie(PASSWORD, NOW + DAY), rotated, NOW),
      false,
    );
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken(env({ TRACK_SESSION_SECRET: SECRET }), NOW);
    assert.ok(token);
    const other = env({ TRACK_SESSION_SECRET: "x".repeat(32), TRACK_LEGACY_SESSIONS: "0" });
    assert.equal(await verifySessionToken(token, other, NOW), false);
  });

  it("signs everyone out when TRACK_SESSION_EPOCH is bumped", async () => {
    const before = env({ TRACK_SESSION_SECRET: SECRET });
    const token = await createSessionToken(before, NOW);
    assert.ok(token);
    const bumped = env({ TRACK_SESSION_SECRET: SECRET, TRACK_SESSION_EPOCH: "1" });
    assert.equal(await verifySessionToken(token, bumped, NOW), false);
    const legacy = legacyCookie(PASSWORD, NOW + DAY);
    assert.equal(await verifySessionToken(legacy, env({ TRACK_SESSION_EPOCH: "1" }), NOW), false);

    const fresh = await createSessionToken(bumped, NOW);
    assert.ok(fresh);
    assert.equal(await verifySessionToken(fresh, bumped, NOW), true);
  });

  it("rejects expired tokens", async () => {
    const token = await createSessionToken(env({ TRACK_SESSION_SECRET: SECRET }), NOW);
    assert.ok(token);
    const later = NOW + 31 * DAY;
    assert.equal(await verifySessionToken(token, env({ TRACK_SESSION_SECRET: SECRET }), later), false);
  });

  it("rejects tampered, truncated and malformed tokens", async () => {
    const good = env({ TRACK_SESSION_SECRET: SECRET });
    const token = await createSessionToken(good, NOW);
    assert.ok(token);
    const [v, epoch, expires, signature] = token.split(".");
    const flipped = signature.replace(/.$/, signature.endsWith("0") ? "1" : "0");
    const cases = [
      `${v}.${epoch}.${Number(expires) + DAY}.${signature}`,
      `${v}.${epoch}.${expires}.${flipped}`,
      token.slice(0, -4),
      "",
      "a.b.c",
      "v2.0.not-a-number.deadbeef",
    ];
    for (const candidate of cases)
      assert.equal(await verifySessionToken(candidate, good, NOW), false, candidate);
  });

  it("checks password matches in constant-size digests", async () => {
    assert.equal(await passwordMatches(PASSWORD, env()), true);
    assert.equal(await passwordMatches("wrong", env()), false);
    assert.equal(await passwordMatches(PASSWORD, {}), false);
  });
});
