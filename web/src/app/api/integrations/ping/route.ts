import { getDb } from "@/lib/db";
import { authorizeIntegration } from "@/lib/integrations/auth";
import { errorResponse, jsonResponse } from "@/lib/integrations/http";
import { recordPing } from "@/lib/integrations/ingest";
import { nowIso } from "@/lib/integrations/time";
import { redactText } from "@/lib/security/redact";

/** Connector heartbeat. Returns server time only; no data is read or written. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = getDb();
    const auth = authorizeIntegration(request, "metadata:write", db);
    if (!auth.ok) return auth.response;
    const result = recordPing(db);
    if (!result.ok) return errorResponse(result.status, result.error);
    return jsonResponse({ ok: true, server_time: nowIso() });
  } catch (error) {
    console.error(`[integrations/ping] ${redactText(String(error)).slice(0, 300)}`);
    return errorResponse(500, "Internal error.");
  }
}
