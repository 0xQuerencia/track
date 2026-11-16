import http from "node:http";
import https from "node:https";
import {
  hostOf,
  parseCheckableUrl,
  resolveCheckTarget,
  type ResolveResult,
} from "./ssrf";

/*
 * One user-clicked health check. Only the outcome is kept: the caller stores
 * Up/Down and a timestamp. No response body is read or stored.
 */

export const CHECK_TIMEOUT_MS = 5000;
export const MAX_REDIRECTS = 2;

export type CheckOutcome =
  | { kind: "checked"; status: "Up" | "Down"; httpStatus: number | null; reason: string }
  | { kind: "blocked"; reason: string };

export type RawResponse = { statusCode: number; location?: string };

export type RequestInput = {
  url: URL;
  address: string;
  family: 4 | 6;
  method: "HEAD" | "GET";
  timeoutMs: number;
};

export type CheckDeps = {
  resolve: (url: URL) => Promise<ResolveResult>;
  request: (input: RequestInput) => Promise<RawResponse>;
  now: () => number;
};

/* ---------- real network request ---------- */

/** Sends one request to a pinned address. Headers only; the body is discarded. */
export function requestOnce(input: RequestInput): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = input.url.protocol === "https:";
    const host = hostOf(input.url);
    const transport = isHttps ? https : http;
    const pinned = input.address;
    const family = input.family;
    const request = transport.request(
      {
        hostname: host,
        port: input.url.port || (isHttps ? 443 : 80),
        path: `${input.url.pathname || "/"}${input.url.search}`,
        method: input.method,
        headers: { "user-agent": "Track-health-check", accept: "*/*" },
        // Connect to the address already screened by the SSRF guard. The host
        // name is still used for TLS (SNI and certificate checks).
        lookup: (_name, options, callback) => {
          if (options.all) callback(null, [{ address: pinned, family }]);
          else callback(null, pinned, family);
        },
        servername: isHttps && !isIpLiteral(host) ? host : undefined,
      },
      (response) => {
        const location =
          typeof response.headers.location === "string" ? response.headers.location : undefined;
        resolve({ statusCode: response.statusCode ?? 0, location });
        response.resume();
        request.destroy();
      },
    );
    request.setTimeout(input.timeoutMs, () => request.destroy(new Error("timed out")));
    request.on("error", reject);
    request.end();
  });
}

function isIpLiteral(host: string): boolean {
  return /^[\d.]+$/.test(host) || host.includes(":");
}

export const defaultDeps: CheckDeps = {
  resolve: (url) => resolveCheckTarget(url),
  request: requestOnce,
  now: () => Date.now(),
};

/* ---------- the check ---------- */

const down = (reason: string, httpStatus: number | null = null): CheckOutcome => ({
  kind: "checked",
  status: "Down",
  httpStatus,
  reason,
});

/**
 * Checks a stored service URL. Up means a 2xx answer within the time budget.
 * Redirects are followed at most MAX_REDIRECTS times, and each hop is screened
 * again. A redirect or DNS answer that points somewhere private blocks the check.
 */
export async function checkServiceUrl(
  raw: unknown,
  deps: CheckDeps = defaultDeps,
): Promise<CheckOutcome> {
  const parsed = parseCheckableUrl(raw);
  if (!parsed.ok) return { kind: "blocked", reason: parsed.reason };

  const deadline = deps.now() + CHECK_TIMEOUT_MS;
  let url = parsed.url;

  for (let hop = 0; ; hop++) {
    const remaining = deadline - deps.now();
    if (remaining <= 0) return down("Timed out");

    const target = await deps.resolve(url);
    if (!target.ok) return target.blocked ? { kind: "blocked", reason: target.reason } : down(target.reason);

    let response: RawResponse;
    try {
      response = await deps.request({ url, address: target.address, family: target.family, method: "HEAD", timeoutMs: remaining });
      // Some servers refuse HEAD; a GET with the body discarded answers the same question.
      if (response.statusCode === 405 || response.statusCode === 501)
        response = await deps.request({ url, address: target.address, family: target.family, method: "GET", timeoutMs: Math.max(1, deadline - deps.now()) });
    } catch (error) {
      return down(error instanceof Error && error.message === "timed out" ? "Timed out" : "Could not connect");
    }

    const { statusCode, location } = response;
    if (statusCode >= 200 && statusCode < 300)
      return { kind: "checked", status: "Up", httpStatus: statusCode, reason: "Answered" };

    if (statusCode >= 300 && statusCode < 400 && location) {
      if (hop >= MAX_REDIRECTS) return down("Too many redirects", statusCode);
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        return down("Redirect could not be read", statusCode);
      }
      const screened = parseCheckableUrl(next.href);
      if (!screened.ok) return { kind: "blocked", reason: `Redirect blocked: ${screened.reason}` };
      url = screened.url;
      continue;
    }

    return down(`HTTP ${statusCode}`, statusCode);
  }
}
