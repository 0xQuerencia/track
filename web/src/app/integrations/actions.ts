"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { getDb } from "@/lib/db";
import { isIntegrationKey, type IntegrationKey } from "@/lib/integrations/catalog";
import { MAX_PASTE_CHARACTERS } from "@/lib/integrations/limits";
import { syncGithubProjects } from "@/lib/integrations/github";
import { ingestRepoEventsManual } from "@/lib/integrations/ingest";
import { getIntegration, setEnabled, setStoreSummaries } from "@/lib/integrations/store";
import { nowIso } from "@/lib/integrations/time";
import { verifyOriginHeaders } from "@/lib/security/origin";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { clearSummaries } from "@/lib/sessions/store";
import { importSessionsManual } from "@/lib/sessions/import";
import type { SessionTool } from "@/lib/sessions/constants";

/*
 * Server actions for the Integrations page. Each one re-checks the session
 * cookie and the request origin. Pasted JSON is capped below the server
 * action body limit, and is parsed by the same validators the connector uses.
 */

export type IntegrationActionState = { ok: boolean; message: string } | null;

const REJECTED = "Request rejected.";
const SESSION_INTEGRATIONS: readonly IntegrationKey[] = ["claude_code", "codex", "opencode"];

async function allowed(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) return false;
  return verifyOriginHeaders(await headers()).ok;
}

function refresh() {
  revalidatePath("/integrations");
  revalidatePath("/sessions", "layout");
}

export async function toggleIntegrationAction(formData: FormData): Promise<void> {
  if (!(await allowed())) return;
  const key = String(formData.get("key") ?? "");
  if (!isIntegrationKey(key)) return;
  const db = getDb();
  if (!getIntegration(db, key)) return;
  const enabled = formData.get("enabled") === "1";
  setEnabled(db, key, enabled, nowIso());
  refresh();
}

/** Turns "store summaries" on or off for one session tool. Turning it off clears what was kept. */
export async function setStoreSummariesAction(formData: FormData): Promise<void> {
  if (!(await allowed())) return;
  const key = String(formData.get("key") ?? "");
  if (!isIntegrationKey(key) || !SESSION_INTEGRATIONS.includes(key)) return;
  const db = getDb();
  const value = formData.get("store_summaries") === "1";
  setStoreSummaries(db, key, value, nowIso());
  if (!value) clearSummaries(db, key as SessionTool);
  refresh();
}

export async function importSessionsPasteAction(
  _previous: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  if (!(await allowed())) return { ok: false, message: REJECTED };
  const text = String(formData.get("payload") ?? "");
  if (!text.trim()) return { ok: false, message: "Paste a sessions JSON document first." };
  if (text.length > MAX_PASTE_CHARACTERS)
    return { ok: false, message: "That paste is too large. Import it in smaller parts." };
  const result = importSessionsManual(getDb(), text);
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  return {
    ok: true,
    message: `Imported ${result.received}: ${result.created} new, ${result.updated} updated, ${result.unchanged} unchanged, ${result.linked} linked to a project, ${result.rejected} rejected.`,
  };
}

export async function importRepoEventsPasteAction(
  _previous: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  if (!(await allowed())) return { ok: false, message: REJECTED };
  const text = String(formData.get("payload") ?? "");
  if (!text.trim()) return { ok: false, message: "Paste a repo events JSON document first." };
  if (text.length > MAX_PASTE_CHARACTERS)
    return { ok: false, message: "That paste is too large." };
  const result = await ingestRepoEventsManual(getDb(), text);
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  return { ok: true, message: `${result.message} ${result.counts.inserted ?? 0} new, ${result.counts.updated ?? 0} updated.` };
}

/** Pulls recent commits, PRs, issues and releases for projects with a github.com repo. Needs GITHUB_TOKEN on the server. */
export async function syncGithubAction(): Promise<void> {
  if (!(await allowed())) return;
  await syncGithubProjects(getDb(), process.env.GITHUB_TOKEN);
  refresh();
}
