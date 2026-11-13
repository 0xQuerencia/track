import { authorizeApi, denied } from "@/lib/api-auth";
import { pullSnapshot } from "@/lib/api-sync";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = authorizeApi(request);
  if (!auth.ok) return denied(auth);
  return Response.json(pullSnapshot(), { headers: { "cache-control": "no-store" } });
}
