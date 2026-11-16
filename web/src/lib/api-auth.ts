import { createHash, timingSafeEqual } from "node:crypto";
import { clientIpFrom, createLimiter } from "@/lib/security/rate-limit";

/**
 * Bearer-token auth for the phone app's sync API. The token lives only in
 * TRACK_API_TOKEN (server env) and in the app's encrypted storage; it is a
 * separate secret from the web password so either can be rotated alone.
 *
 * Fails closed: with TRACK_API_TOKEN unset or shorter than 24 characters every
 * request gets 503. Comparison is over SHA-256 digests with timingSafeEqual.
 */

const MIN_TOKEN_LENGTH = 24;
const limiter = createLimiter({ max: 8, windowMs: 10 * 60_000 });

const digest = (value: string) => createHash("sha256").update(value).digest();

export type ApiAuth = { ok: true } | { ok: false; status: 401 | 429 | 503 };

export function authorizeApi(request: Request): ApiAuth {
  const expected = process.env.TRACK_API_TOKEN;
  if (!expected || expected.length < MIN_TOKEN_LENGTH) return { ok: false, status: 503 };

  const ip = clientIpFrom(request.headers);
  if (limiter.status(ip).locked) return { ok: false, status: 429 };

  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (supplied && timingSafeEqual(digest(supplied), digest(expected))) {
    limiter.reset(ip);
    return { ok: true };
  }

  limiter.recordFailure(ip);
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
