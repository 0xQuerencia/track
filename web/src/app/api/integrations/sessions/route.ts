import { getDb } from "@/lib/db";
import { authorizeIntegration } from "@/lib/integrations/auth";
import { errorResponse, jsonResponse, readJsonBody } from "@/lib/integrations/http";
import { redactText } from "@/lib/security/redact";
import { importSessions } from "@/lib/sessions/import";

/**
 * Session metadata from the connector. Bearer token with scope sessions:write.
 * Body: sessions envelope v1 (see src/lib/sessions/schema.ts). Idempotent.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const db = getDb();
    const auth = authorizeIntegration(request, "sessions:write", db);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const result = importSessions(db, body.value, "connector");
    if (!result.ok) return errorResponse(result.status, result.error);
    return jsonResponse({
      ok: true,
      integration: result.integration,
      received: result.received,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      linked: result.linked,
      rejected: result.rejected,
      summaries_dropped: result.summariesDropped,
    });
  } catch (error) {
    console.error(`[integrations/sessions] ${redactText(String(error)).slice(0, 300)}`);
    return errorResponse(500, "Internal error.");
  }
}
