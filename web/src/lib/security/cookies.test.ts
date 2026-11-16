import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isHttpsDeployment, sessionCookieOptions } from "./cookies";

const none = new Headers();
const forwardedHttps = new Headers({ "x-forwarded-proto": "https" });

describe("isHttpsDeployment", () => {
  it("is false for plain HTTP with no hints", () => {
    assert.equal(isHttpsDeployment(none, {}), false);
  });

  it("is true when TRACK_COOKIE_SECURE=1", () => {
    assert.equal(isHttpsDeployment(none, { TRACK_COOKIE_SECURE: "1" }), true);
  });

  it("is true when TRACK_PUBLIC_URL is https, and false when http", () => {
    assert.equal(isHttpsDeployment(none, { TRACK_PUBLIC_URL: "https://t.example" }), true);
    assert.equal(isHttpsDeployment(none, { TRACK_PUBLIC_URL: "http://t.example" }), false);
    assert.equal(isHttpsDeployment(none, { TRACK_PUBLIC_URL: "not a url" }), false);
  });

  it("is true when the proxy reports https as the first forwarded proto", () => {
    assert.equal(isHttpsDeployment(forwardedHttps, {}), true);
    assert.equal(
      isHttpsDeployment(new Headers({ "x-forwarded-proto": "https, http" }), {}),
      true,
    );
  });
});

describe("sessionCookieOptions", () => {
  it("is httpOnly, lax, path / and carries the given lifetime", () => {
    assert.deepEqual(sessionCookieOptions(none, 60, {}), {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60,
    });
  });

  it("sets secure on HTTPS deployments", () => {
    assert.equal(sessionCookieOptions(forwardedHttps, 60, {}).secure, true);
  });
});
