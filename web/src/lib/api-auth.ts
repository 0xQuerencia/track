import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Bearer-token auth for the phone app's sync API. The token lives only in
 * TRACK_API_TOKEN (server env) and in the app's encrypted storage; it is a
 * separate secret from the web password so either can be rotated alone.
 */

const MAX_FAILURES = 8;
const WINDOW_MS = 10 * 60_000;
const failures = new Map<string, { count: number; resetAt: number }>();

const digest = (value: string) => createHash("sha256").update(value).digest();

export type ApiAuth = { ok: true } | { ok: false; status: 401 | 429 | 503 };

export function authorizeApi(request: Request): ApiAuth {
  const expected = process.env.TRACK_API_TOKEN;
  if (!expected || expected.length < 24) return { ok: false, status: 503 };

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const entry = failures.get(ip);
  if (entry && entry.resetAt > now && entry.count >= MAX_FAILURES)
    return { ok: false, status: 429 };

  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (supplied && timingSafeEqual(digest(supplied), digest(expected))) {
    failures.delete(ip);
    return { ok: true };
  }

  failures.set(ip, {
    count: entry && entry.resetAt > now ? entry.count + 1 : 1,
    resetAt: entry && entry.resetAt > now ? entry.resetAt : now + WINDOW_MS,
  });
  return { ok: false, status: 401 };
}

export function denied(auth: Extract<ApiAuth, { ok: false }>): Response {
  const message =
    auth.status === 429
      ? "Too many attempts."
      : auth.status === 503
        ? "API token not configured."
        : "Unauthorized.";
  return Response.json({ error: message }, { status: auth.status });
}
