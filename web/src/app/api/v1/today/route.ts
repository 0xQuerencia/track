import { authorizeApi, denied } from "@/lib/api-auth";
import { todaySnapshot } from "@/lib/api-sync";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = authorizeApi(request);
  if (!auth.ok) return denied(auth);
  return Response.json(todaySnapshot(), { headers: { "cache-control": "no-store" } });
}
