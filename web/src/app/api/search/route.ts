import { cookies } from "next/headers";
import { searchAll } from "@/lib/crud";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/*
 * Record search for the command palette and the link picker. The proxy
 * already requires a session for this path; the check here is a second
 * guard so the route stays closed if the proxy rules ever change.
 */

export const dynamic = "force-dynamic";

const MAX_HITS = 20;
const MAX_TERM = 80;
const PER_ENTITY = 4;

export async function GET(request: Request) {
  const headers = { "cache-control": "no-store" };
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token)))
    return Response.json({ error: "Unauthorized." }, { status: 401, headers });

  const term = new URL(request.url).searchParams.get("q") ?? "";
  const hits = searchAll(term.slice(0, MAX_TERM), PER_ENTITY).slice(0, MAX_HITS);
  return Response.json({ hits }, { headers });
}
