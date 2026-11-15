/**
 * Attributes for the session cookie. Dependency-free so it is testable.
 *
 * SameSite stays Lax, not Strict. Strict would drop the cookie on any
 * top-level navigation from another site (a link in chat or email), so a
 * signed-in user would land on /login. Lax still blocks cross-site POSTs,
 * and server actions and the origin check cover the rest.
 */

export type SessionCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
};

type Env = Record<string, string | undefined>;

function publicUrlIsHttps(publicUrl: string | undefined): boolean {
  if (!publicUrl) return false;
  try {
    return new URL(publicUrl).protocol === "https:";
  } catch {
    return false;
  }
}

/** True when the browser reached us over HTTPS, directly or via a proxy. */
export function isHttpsDeployment(
  headers: Pick<Headers, "get">,
  env: Env = process.env,
): boolean {
  if (env.TRACK_COOKIE_SECURE === "1") return true;
  if (publicUrlIsHttps(env.TRACK_PUBLIC_URL)) return true;
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return proto === "https";
}

export function sessionCookieOptions(
  headers: Pick<Headers, "get">,
  maxAgeSeconds: number,
  env: Env = process.env,
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsDeployment(headers, env),
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
