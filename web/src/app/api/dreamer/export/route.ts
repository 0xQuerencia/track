import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { exportMissionData } from "@/lib/dreamer/job-privacy";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

const TABLES = [
  "dreamer_settings", "dreamer_sources", "dreamer_documents", "dreamer_terms", "dreamer_evidence",
  "dreamer_insights", "dreamer_insight_evidence", "dreamer_insight_projects", "dreamer_links",
  "dreamer_runs", "dreamer_suggestions", "dreamer_suggestion_evidence", "dreamer_suggestion_projects",
  "dreamer_feedback", "dreamer_briefs",
] as const;

/** Export is session-authenticated and private because it contains derived quotes. */
export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token)))
    return Response.json({ error: "Unauthorized." }, { status: 401, headers: { "cache-control": "no-store" } });
  const db = getDb();
  const data: Record<string, unknown[]> = {};
  for (const table of TABLES) data[table] = db.prepare(`SELECT * FROM ${table}`).all() as unknown[];
  Object.assign(data,exportMissionData(db));
  return Response.json({ exported_at: new Date().toISOString(), data }, {
    headers: {
      "cache-control": "no-store, private",
      "content-disposition": "attachment; filename=track-dreamer-export.json",
    },
  });
}
