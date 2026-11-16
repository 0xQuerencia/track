import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db";
import { clientIpFrom, createLimiter } from "../security/rate-limit";
import {
  tokenFromAuthorization,
  verifyToken,
  type IntegrationScope,
} from "../security/integration-tokens";
import { errorResponse } from "./http";

/*
 * Bearer auth for /api/integrations/*. Fails closed: a missing, malformed,
 * unknown or revoked token gets 401; a valid token without the route's scope
 * gets 403. Failed attempts are limited per client address and accepted
 * requests per token, so one leaked token cannot flood the database.
 */

const FAILED_ATTEMPTS_PER_IP = 10;
const FAILURE_WINDOW_MS = 10 * 60_000;
const REQUESTS_PER_TOKEN = 120;
const REQUEST_WINDOW_MS = 60_000;

const failures = createLimiter({ max: FAILED_ATTEMPTS_PER_IP, windowMs: FAILURE_WINDOW_MS });
const requests = createLimiter({ max: REQUESTS_PER_TOKEN, windowMs: REQUEST_WINDOW_MS });

export type IntegrationAuth =
  | { ok: true; tokenId: number; label: string }
  | { ok: false; response: Response };

/**
 * Checks the bearer token for `scope` and counts the request against the
 * token's rate limit. Call once per request, at the top of the handler.
 */
export function authorizeIntegration(
  request: Request,
  scope: IntegrationScope,
  db: DatabaseSync = getDb(),
): IntegrationAuth {
  const ip = clientIpFrom(request.headers);
  if (failures.status(ip).locked)
    return { ok: false, response: errorResponse(429, "Too many failed attempts.") };

  const bearer = tokenFromAuthorization(request.headers.get("authorization"));
  const result = verifyToken(db, bearer, scope);
  if (!result.ok) {
    if (result.reason === "scope")
      return { ok: false, response: errorResponse(403, "This token lacks the required scope.") };
    failures.recordFailure(ip);
    return { ok: false, response: errorResponse(401, "Unauthorized.") };
  }

  const bucket = `token:${result.id}`;
  if (requests.status(bucket).locked)
    return { ok: false, response: errorResponse(429, "Too many requests.") };
  // The limiter counts events, so each accepted request is recorded as one.
  requests.recordFailure(bucket);
  return { ok: true, tokenId: result.id, label: result.label };
}
