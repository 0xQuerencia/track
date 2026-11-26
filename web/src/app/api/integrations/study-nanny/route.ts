import { getDb } from "@/lib/db";
import { authorizeIntegration } from "@/lib/integrations/auth";
import { errorResponse, jsonResponse, readJsonBody } from "@/lib/integrations/http";
import { storeCompletedSession } from "@/lib/study-nanny/sessions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = getDb();
  const auth = authorizeIntegration(request, "study-nanny:write", db);
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request, 2048);
  if (!body.ok) return body.response;
  const result = storeCompletedSession(db, auth.tokenId, body.value);
  return result ? jsonResponse({ ok: true, ...result }) : errorResponse(400, "Invalid completed Study Nanny session.");
}
