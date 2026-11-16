import { getDb } from "@/lib/db";
import { runDailyCycle } from "@/lib/dreamer/cycle";
import { authorizeIntegration } from "@/lib/integrations/auth";
import { errorResponse, jsonResponse } from "@/lib/integrations/http";

/** Scheduled local-first run. A scoped bearer token is required; content is never returned. */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = getDb();
  const auth = authorizeIntegration(request, "dreamer:run", db);
  if (!auth.ok) return auth.response;
  try {
    const result = await runDailyCycle(db);
    return jsonResponse({
      ok: true,
      period_key: result.periodKey,
      already_ran: result.alreadyRan,
      processed: result.processed,
      unchanged: result.unchanged,
      new_insights: result.newInsights,
      new_suggestions: result.newSuggestions,
    });
  } catch {
    return errorResponse(500, "Dreamer could not complete the scheduled run.");
  }
}
