import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, describe, it } from "node:test";
import { checkServiceUrl, requestOnce, type CheckDeps, type RawResponse, type RequestInput } from "./check";
import type { ResolveResult } from "./ssrf";

/** A fake network: each host name maps to a resolution, and each request pops a scripted reply. */
function fakeDeps(options: {
  resolve?: (host: string) => ResolveResult;
  replies?: Record<string, RawResponse | Error | (() => RawResponse)>;
  clock?: number[];
}) {
  const requests: RequestInput[] = [];
  let tick = 0;
  const deps: CheckDeps = {
    resolve: async (url) => {
      const host = url.hostname;
      return options.resolve?.(host) ?? { ok: true, address: "93.184.216.34", family: 4 };
    },
    request: async (input) => {
      requests.push(input);
      const key = `${input.method} ${input.url.href}`;
      const reply = options.replies?.[key];
      if (reply instanceof Error) throw reply;
      if (typeof reply === "function") return reply();
      if (reply) return reply;
      throw new Error(`no reply scripted for ${key}`);
    },
    now: () => (options.clock ? options.clock[Math.min(tick++, options.clock.length - 1)] : 0),
  };
  return { deps, requests };
}

describe("checkServiceUrl", () => {
  it("reports Up for a 2xx answer to HEAD, pinned to the resolved address", async () => {
    const { deps, requests } = fakeDeps({
      replies: { "HEAD https://example.com/": { statusCode: 200 } },
    });
    const outcome = await checkServiceUrl("https://example.com", deps);
    assert.equal(outcome.kind, "checked");
    if (outcome.kind === "checked") {
      assert.equal(outcome.status, "Up");
      assert.equal(outcome.httpStatus, 200);
    }
    assert.equal(requests.length, 1);
    assert.equal(requests[0].address, "93.184.216.34");
    assert.equal(requests[0].method, "HEAD");
  });

  it("retries with GET when the server refuses HEAD", async () => {
    const { deps, requests } = fakeDeps({
      replies: {
        "HEAD https://example.com/": { statusCode: 405 },
        "GET https://example.com/": { statusCode: 204 },
      },
    });
    const outcome = await checkServiceUrl("https://example.com", deps);
    assert.equal(outcome.kind === "checked" && outcome.status, "Up");
    assert.deepEqual(requests.map((r) => r.method), ["HEAD", "GET"]);
  });

  it("reports Down for a 5xx answer and keeps the HTTP code", async () => {
    const { deps } = fakeDeps({ replies: { "HEAD https://example.com/": { statusCode: 503 } } });
    const outcome = await checkServiceUrl("https://example.com", deps);
    assert.deepEqual(outcome, { kind: "checked", status: "Down", httpStatus: 503, reason: "HTTP 503" });
  });

  it("follows up to two redirects, re-screening each hop", async () => {
    const { deps, requests } = fakeDeps({
      replies: {
        "HEAD https://example.com/": { statusCode: 301, location: "https://www.example.com/a" },
        "HEAD https://www.example.com/a": { statusCode: 302, location: "/b" },
        "HEAD https://www.example.com/b": { statusCode: 200 },
      },
    });
    const outcome = await checkServiceUrl("https://example.com", deps);
    assert.equal(outcome.kind === "checked" && outcome.status, "Up");
    assert.equal(requests.length, 3);
  });

  it("gives up after a third redirect", async () => {
    const hop = (to: string) => ({ statusCode: 302, location: to });
    const { deps } = fakeDeps({
      replies: {
        "HEAD https://example.com/": hop("https://example.com/1"),
        "HEAD https://example.com/1": hop("https://example.com/2"),
        "HEAD https://example.com/2": hop("https://example.com/3"),
        "HEAD https://example.com/3": { statusCode: 200 },
      },
    });
    const outcome = await checkServiceUrl("https://example.com", deps);
    assert.deepEqual(outcome, {
      kind: "checked",
      status: "Down",
      httpStatus: 302,
      reason: "Too many redirects",
    });
  });

  it("blocks a redirect that points at a private address, without contacting it", async () => {
    const { deps, requests } = fakeDeps({
      replies: {
        "HEAD https://example.com/": { statusCode: 302, location: "http://169.254.169.254/latest/meta-data/" },
      },
    });
    const outcome = await checkServiceUrl("https://example.com", deps);
    assert.equal(outcome.kind, "blocked");
    assert.equal(requests.length, 1, "the metadata address must never be requested");
  });

  it("blocks a redirect to a host name that resolves privately", async () => {
    const { deps, requests } = fakeDeps({
      resolve: (host) =>
        host === "internal.example"
          ? { ok: false, blocked: true, reason: "private" }
          : { ok: true, address: "93.184.216.34", family: 4 },
      replies: {
        "HEAD https://example.com/": { statusCode: 302, location: "https://internal.example/admin" },
      },
    });
    const outcome = await checkServiceUrl("https://example.com", deps);
    assert.equal(outcome.kind, "blocked");
    assert.equal(requests.length, 1);
  });

  it("blocks a URL whose host resolves to a private address before any request", async () => {
    const { deps, requests } = fakeDeps({
      resolve: () => ({ ok: false, blocked: true, reason: "private" }),
    });
    const outcome = await checkServiceUrl("https://example.com", deps);
    assert.equal(outcome.kind, "blocked");
    assert.equal(requests.length, 0);
  });

  it("refuses non-http URLs and local names without any lookup", async () => {
    let resolved = false;
    const { deps } = fakeDeps({
      resolve: () => {
        resolved = true;
        return { ok: true, address: "1.1.1.1", family: 4 };
      },
    });
    assert.equal((await checkServiceUrl("ftp://example.com", deps)).kind, "blocked");
    assert.equal((await checkServiceUrl("http://localhost:8080", deps)).kind, "blocked");
    assert.equal(resolved, false);
  });

  it("reports Down, not blocked, when the name cannot be resolved", async () => {
    const { deps } = fakeDeps({
      resolve: () => ({ ok: false, blocked: false, reason: "The host name could not be resolved." }),
    });
    const outcome = await checkServiceUrl("https://example.com", deps);
    assert.equal(outcome.kind === "checked" && outcome.status, "Down");
  });

  it("reports Down with a timeout reason when the request times out", async () => {
    const { deps } = fakeDeps({
      replies: { "HEAD https://example.com/": new Error("timed out") },
    });
    const outcome = await checkServiceUrl("https://example.com", deps);
    assert.deepEqual(outcome, { kind: "checked", status: "Down", httpStatus: null, reason: "Timed out" });
  });

  it("reports Down when the 5 second budget is already spent", async () => {
    // Start at t=0 (deadline 5000); the first check sees t=6000.
    const { deps, requests } = fakeDeps({ clock: [0, 6000], replies: {} });
    const outcome = await checkServiceUrl("https://example.com", deps);
    assert.equal(outcome.kind === "checked" && outcome.reason, "Timed out");
    assert.equal(requests.length, 0);
  });

  it("reports Down for a connection error", async () => {
    const { deps } = fakeDeps({
      replies: { "HEAD https://example.com/": new Error("ECONNREFUSED") },
    });
    const outcome = await checkServiceUrl("https://example.com", deps);
    assert.equal(outcome.kind === "checked" && outcome.reason, "Could not connect");
  });
});

describe("requestOnce (real socket, pinned address)", () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "http://127.0.0.1/elsewhere" });
      res.end();
      return;
    }
    res.writeHead(req.method === "HEAD" ? 200 : 200, { "content-type": "text/plain" });
    res.end("ok");
  });
  let port = 0;
  const ready = new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      port = (server.address() as AddressInfo).port;
      resolve();
    }),
  );
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("connects to the pinned address and returns the status", async () => {
    await ready;
    const response = await requestOnce({
      url: new URL(`http://does-not-matter.example:${port}/`),
      address: "127.0.0.1",
      family: 4,
      method: "HEAD",
      timeoutMs: 2000,
    });
    assert.equal(response.statusCode, 200);
  });

  it("returns the Location header without following it", async () => {
    await ready;
    const response = await requestOnce({
      url: new URL(`http://does-not-matter.example:${port}/redirect`),
      address: "127.0.0.1",
      family: 4,
      method: "GET",
      timeoutMs: 2000,
    });
    assert.equal(response.statusCode, 302);
    assert.equal(response.location, "http://127.0.0.1/elsewhere");
  });
});
