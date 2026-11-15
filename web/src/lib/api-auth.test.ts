import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { authorizeApi } from "./api-auth";

const TOKEN = "a".repeat(32);

function request(ip: string, authorization?: string): Request {
  const headers = new Headers({ "x-forwarded-for": ip });
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("http://localhost/api/v1/today", { headers });
}

afterEach(() => {
  delete process.env.TRACK_API_TOKEN;
});

describe("authorizeApi", () => {
  it("fails closed with 503 when TRACK_API_TOKEN is unset", () => {
    delete process.env.TRACK_API_TOKEN;
    assert.deepEqual(authorizeApi(request("10.1.0.1", `Bearer ${TOKEN}`)), {
      ok: false,
      status: 503,
    });
  });

  it("fails closed with 503 when the configured token is shorter than 24 characters", () => {
    process.env.TRACK_API_TOKEN = "short";
    assert.deepEqual(authorizeApi(request("10.1.0.2", "Bearer short")), {
      ok: false,
      status: 503,
    });
  });

  it("accepts the exact bearer token and rejects anything else with 401", () => {
    process.env.TRACK_API_TOKEN = TOKEN;
    assert.deepEqual(authorizeApi(request("10.1.0.3", `Bearer ${TOKEN}`)), { ok: true });
    assert.deepEqual(authorizeApi(request("10.1.0.4", `Bearer ${TOKEN}x`)), {
      ok: false,
      status: 401,
    });
    assert.deepEqual(authorizeApi(request("10.1.0.5")), { ok: false, status: 401 });
    assert.deepEqual(authorizeApi(request("10.1.0.6", `Basic ${TOKEN}`)), {
      ok: false,
      status: 401,
    });
  });

  it("locks an address with 429 after eight failures, and a success clears its count", () => {
    process.env.TRACK_API_TOKEN = TOKEN;
    const ip = "10.2.0.1";
    for (let i = 0; i < 8; i++)
      assert.deepEqual(authorizeApi(request(ip, "Bearer nope")), { ok: false, status: 401 });
    assert.deepEqual(authorizeApi(request(ip, `Bearer ${TOKEN}`)), {
      ok: false,
      status: 429,
    });

    const other = "10.2.0.2";
    for (let i = 0; i < 7; i++) authorizeApi(request(other, "Bearer nope"));
    assert.deepEqual(authorizeApi(request(other, `Bearer ${TOKEN}`)), { ok: true });
    assert.deepEqual(authorizeApi(request(other, "Bearer nope")), { ok: false, status: 401 });
  });
});
