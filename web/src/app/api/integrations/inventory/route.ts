import { getDb } from "@/lib/db";
import { authorizeIntegration } from "@/lib/integrations/auth";
import { errorResponse, jsonResponse, readJsonBody } from "@/lib/integrations/http";
import { ingestInventory } from "@/lib/integrations/ingest";
import { redactText } from "@/lib/security/redact";

/**
 * Project inventory from the connector. Bearer token with scope projects:write.
 * The Projects module validates the envelope; this route checks the token,
 * the body cap and the content type. Returns 501 when that module is absent.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const db = getDb();
    const auth = authorizeIntegration(request, "projects:write", db);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const result = await ingestInventory(db, body.value);
    if (!result.ok) return errorResponse(result.status, result.error);
    return jsonResponse({ ok: true, message: result.message, ...result.counts });
  } catch (error) {
    console.error(`[integrations/inventory] ${redactText(String(error)).slice(0, 300)}`);
    return errorResponse(500, "Internal error.");
  }
}
