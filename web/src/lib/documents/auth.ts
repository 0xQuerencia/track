import { SESSION_COOKIE, verifySessionToken, type SessionEnv } from "../session";

/**
 * Whether a Request carries a valid session cookie. Route handlers use this
 * instead of next/headers so the check works on a plain Request too. The
 * proxy already redirects unauthenticated page visits; this is the second
 * guard for direct requests to the file route.
 */
export async function isAuthenticatedRequest(
  request: Request,
  env: SessionEnv = process.env,
): Promise<boolean> {
  const token = cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  return token ? verifySessionToken(token, env) : false;
}

/** The value of one cookie from a Cookie header, or null. */
export function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    return value || null;
  }
  return null;
}
