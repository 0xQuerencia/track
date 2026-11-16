import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkOrigin, verifyOriginHeaders, verifySameOrigin } from "./origin";

describe("checkOrigin", () => {
  it("accepts the same origin as the request", () => {
    const result = checkOrigin({
      origin: "http://localhost:3000",
      requestUrl: "http://localhost:3000/login",
      host: "localhost:3000",
    });
    assert.deepEqual(result, { ok: true });
  });

  it("rejects a cross-site origin", () => {
    const result = checkOrigin({
      origin: "https://evil.example",
      requestUrl: "http://localhost:3000/",
      host: "localhost:3000",
    });
    assert.equal(result.ok, false);
  });

  it("rejects a missing Origin header", () => {
    assert.equal(
      checkOrigin({ origin: null, requestUrl: "http://localhost:3000/", host: "localhost:3000" }).ok,
      false,
    );
  });

  it("rejects malformed and non-http origins", () => {
    for (const origin of ["null", "not a url", "ftp://localhost:3000"]) {
      assert.equal(
        checkOrigin({ origin, requestUrl: "http://localhost:3000/", host: "localhost:3000" }).ok,
        false,
        origin,
      );
    }
  });

  it("accepts the public URL behind a proxy whose internal host differs", () => {
    const result = checkOrigin({
      origin: "https://track.example.com",
      host: "app:3000",
      publicUrl: "https://track.example.com",
    });
    assert.deepEqual(result, { ok: true });
  });

  it("accepts forwarded host and proto from a proxy", () => {
    const result = checkOrigin({
      origin: "https://track.example.com",
      host: "app:3000",
      forwardedHost: "track.example.com",
      forwardedProto: "https",
    });
    assert.deepEqual(result, { ok: true });
  });

  it("does not trust forwarded host when proto disagrees", () => {
    const result = checkOrigin({
      origin: "https://track.example.com",
      host: "app:3000",
      forwardedHost: "track.example.com",
      forwardedProto: "http",
    });
    assert.equal(result.ok, false);
  });
});

describe("verifySameOrigin and verifyOriginHeaders", () => {
  it("checks a Request against its own URL", () => {
    const same = new Request("http://localhost:3000/api/x", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    const other = new Request("http://localhost:3000/api/x", {
      method: "POST",
      headers: { origin: "http://evil.example" },
    });
    assert.equal(verifySameOrigin(same, undefined).ok, true);
    assert.equal(verifySameOrigin(other, undefined).ok, false);
  });

  it("checks headers alone, as server actions must", () => {
    const headers = new Headers({
      origin: "https://track.example.com",
      host: "app:3000",
      "x-forwarded-host": "track.example.com",
      "x-forwarded-proto": "https",
    });
    assert.equal(verifyOriginHeaders(headers, undefined).ok, true);
    assert.equal(verifyOriginHeaders(new Headers({ host: "app:3000" }), undefined).ok, false);
  });
});
