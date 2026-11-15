/**
 * CSRF guard for state-changing requests that authenticate with the session
 * cookie. Browsers attach Origin to cross-site POSTs, so an Origin that does
 * not name this app (or a missing Origin) is rejected. Bearer-token routes
 * do not need this: the browser never attaches that header on its own.
 *
 * Use `verifySameOrigin(request)` in a route handler, or `checkOrigin` with
 * explicit inputs in tests.
 */

export type OriginCheck = { ok: true } | { ok: false; reason: string };

export type OriginInput = {
  origin: string | null;
  /** Full URL of the request, when known. Server actions may not have it. */
  requestUrl?: string | null;
  host?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  publicUrl?: string | null;
};

const reject = (reason: string): OriginCheck => ({ ok: false, reason });

function originOf(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/** Builds the set of origins this request may legitimately come from. */
function allowedOrigins(input: OriginInput): Set<string> {
  const allowed = new Set<string>();
  const requestOrigin = input.requestUrl ? originOf(input.requestUrl) : null;
  if (requestOrigin) allowed.add(requestOrigin);
  const publicOrigin = input.publicUrl ? originOf(input.publicUrl) : null;
  if (publicOrigin) allowed.add(publicOrigin);

  const proto =
    input.forwardedProto?.split(",")[0]?.trim() ||
    (requestOrigin ? new URL(requestOrigin).protocol.slice(0, -1) : "http");
  const hosts = [input.host, input.forwardedHost?.split(",")[0]?.trim()];
  for (const host of hosts) {
    if (host) {
      const origin = originOf(`${proto}://${host}`);
      if (origin) allowed.add(origin);
    }
  }
  return allowed;
}

export function checkOrigin(input: OriginInput): OriginCheck {
  if (!input.origin) return reject("Missing Origin header.");
  const origin = originOf(input.origin);
  if (!origin) return reject("Malformed Origin header.");
  return allowedOrigins(input).has(origin)
    ? { ok: true }
    : reject("Origin does not match this server.");
}

/** Checks a request's Origin using its headers only (works in server actions). */
export function verifyOriginHeaders(
  headers: Pick<Headers, "get">,
  publicUrl: string | undefined = process.env.TRACK_PUBLIC_URL,
): OriginCheck {
  return checkOrigin({
    origin: headers.get("origin"),
    host: headers.get("host"),
    forwardedHost: headers.get("x-forwarded-host"),
    forwardedProto: headers.get("x-forwarded-proto"),
    publicUrl,
  });
}

/** Checks a Request's Origin. Route handlers that take cookie-authed POSTs call this. */
export function verifySameOrigin(
  request: Request,
  publicUrl: string | undefined = process.env.TRACK_PUBLIC_URL,
): OriginCheck {
  return checkOrigin({
    origin: request.headers.get("origin"),
    requestUrl: request.url,
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    publicUrl,
  });
}
