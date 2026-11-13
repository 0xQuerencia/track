import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/** Everything except the login page needs a valid session cookie. */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  // The phone app authenticates with its own bearer token inside each route.
  if (pathname.startsWith("/api/v1/")) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token))) return NextResponse.next();

  // Behind a forwarding proxy the request's own host is the server's internal
  // name, so TRACK_PUBLIC_URL (e.g. https://track.example.com) pins redirects
  // to the public address. Without it, the request's own URL is used.
  const publicBase = process.env.TRACK_PUBLIC_URL;
  if (publicBase) return NextResponse.redirect(new URL("/login", publicBase));

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Static assets (anything with a file extension) and Next internals skip it.
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
