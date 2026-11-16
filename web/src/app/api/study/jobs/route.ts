import { getDb } from "@/lib/db";
import { authorizeIntegration } from "@/lib/integrations/auth";
import { errorResponse, jsonResponse } from "@/lib/integrations/http";
import { runDueJobs } from "@/lib/qv/jobs";

/**
 * Scheduler trigger for systemd timers or cron. Requires a study:jobs bearer token.
 * Idempotent: a job whose latest slot already ran is reported as skipped.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = getDb();
  const auth = authorizeIntegration(request, "study:jobs", db);
  if (!auth.ok) return auth.response;
  try {
    const outcomes = runDueJobs({ db });
    return jsonResponse({ ok: true, jobs: outcomes.map((o) => ({ job: o.job, key: o.key, result: o.result, error: o.error })) });
  } catch {
    return errorResponse(500, "The study jobs could not run.");
  }
}
