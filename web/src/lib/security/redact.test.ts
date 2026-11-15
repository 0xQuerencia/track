import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { REDACTED, redact, redactText } from "./redact";

describe("redactText", () => {
  it("redacts bearer tokens in header lines and bare text", () => {
    assert.equal(
      redactText("Authorization: Bearer abc.DEF_123+/="),
      `Authorization: Bearer ${REDACTED}`,
    );
    assert.equal(redactText("got bearer xyz"), `got Bearer ${REDACTED}`);
  });

  it("redacts scoped integration tokens", () => {
    const token = "trk_" + "A".repeat(43);
    assert.equal(redactText(`token=${token} ok`).includes(token), false);
    assert.ok(redactText(token).startsWith(`trk_${REDACTED}`));
  });

  it("redacts whole cookie header values", () => {
    const line = "Cookie: track_session=1700000000000.abc; theme=dark";
    const out = redactText(line);
    assert.equal(out.includes("1700000000000"), false);
    assert.equal(out.includes("theme=dark"), false);
  });

  it("redacts the session cookie wherever it appears", () => {
    assert.equal(
      redactText("set track_session=secretvalue; Path=/"),
      `set track_session=${REDACTED}; Path=/`,
    );
  });

  it("redacts password-like key=value and JSON pairs", () => {
    assert.equal(redactText("password=hunter2 user=me"), `password=${REDACTED} user=me`);
    assert.equal(
      redactText('{"api_key": "sk-123", "ok": 1}'),
      `{"api_key": "${REDACTED}", "ok": 1}`,
    );
    assert.equal(redactText("TRACK_API_TOKEN: abc"), `TRACK_API_TOKEN: ${REDACTED}`);
  });

  it("leaves ordinary text alone", () => {
    const text = "api op failed insert tasks row 42";
    assert.equal(redactText(text), text);
  });
});

describe("redact (structured values)", () => {
  it("replaces values under sensitive keys wholesale", () => {
    assert.deepEqual(
      redact({ password: "hunter2", note: "fine", apiToken: "x", cookie: "y" }),
      { password: REDACTED, note: "fine", apiToken: REDACTED, cookie: REDACTED },
    );
  });

  it("scrubs strings inside nested arrays and objects", () => {
    const value = {
      request: { headers: ["Bearer topsecret1234567890"] },
      list: [{ line: "password=abc" }],
    };
    assert.deepEqual(redact(value), {
      request: { headers: [`Bearer ${REDACTED}`] },
      list: [{ line: `password=${REDACTED}` }],
    });
  });

  it("keeps only name and message for Errors", () => {
    const error = new Error("bad token trk_" + "B".repeat(43));
    const out = redact(error) as { name: string; message: string; stack?: string };
    assert.equal(out.name, "Error");
    assert.equal(out.message.includes("B".repeat(43)), false);
    assert.equal("stack" in out, false);
  });

  it("converts Headers and redacts its sensitive entries", () => {
    const headers = new Headers({ authorization: "Bearer zzz", accept: "text/html" });
    assert.deepEqual(redact(headers), { authorization: REDACTED, accept: "text/html" });
  });

  it("passes through primitives and stops on cyclic input", () => {
    assert.equal(redact(42), 42);
    assert.equal(redact(null), null);
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    const out = redact(cyclic) as Record<string, unknown>;
    assert.equal(out.name, "loop");
    assert.ok(JSON.stringify(out).includes("[Truncated]"));
  });
});
