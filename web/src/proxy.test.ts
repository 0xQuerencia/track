import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const request = (path: string) => new NextRequest(new URL(path, "http://track.test"));

describe("proxy session guard", () => {
  it("lets integration routes through so their own bearer check decides", async () => {
    const response = await proxy(request("/api/integrations/ping"));
    assert.equal(response.headers.get("location"), null);
  });

  it("does not exempt look-alike prefixes", async () => {
    const response = await proxy(request("/api/integrationsfoo"));
    assert.equal(response.status, 307);
    assert.match(response.headers.get("location") ?? "", /\/login$/);
  });

  it("still sends pages without a cookie to login", async () => {
    const response = await proxy(request("/sessions"));
    assert.match(response.headers.get("location") ?? "", /\/login$/);
  });

  it("keeps the phone API exemption", async () => {
    const response = await proxy(request("/api/v1/today"));
    assert.equal(response.headers.get("location"), null);
  });
});
