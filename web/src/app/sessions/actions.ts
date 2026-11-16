"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { verifyOriginHeaders } from "@/lib/security/origin";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { parseId } from "@/lib/sessions/format";
import { chooseProject, deleteSession, saveNotes } from "@/lib/sessions/store";
import { cleanText } from "@/lib/sessions/sanitize";

/*
 * Server actions for the session detail page. Each one re-checks the session
 * cookie and the request origin, validates its input, and uses parameterised
 * SQL through the store module.
 */

export type SessionActionState = { ok: boolean; message: string } | null;

const MAX_NOTES_LENGTH = 10_000;
const REJECTED = "Request rejected.";

async function requireSession(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return Boolean(token && (await verifySessionToken(token)));
}

async function sameOrigin(): Promise<boolean> {
  return verifyOriginHeaders(await headers()).ok;
}

const refresh = () => revalidatePath("/sessions", "layout");

/** Links a session to a project, or unlinks it with project = "none". */
export async function setSessionProjectAction(
  _previous: SessionActionState,
  formData: FormData,
): Promise<SessionActionState> {
  if (!(await requireSession()) || !(await sameOrigin())) return { ok: false, message: REJECTED };
  const id = parseId(formData.get("id"));
  if (id === null) return { ok: false, message: "Session not found." };
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM ai_sessions WHERE id = ?").get(id))
    return { ok: false, message: "Session not found." };

  const raw = String(formData.get("project") ?? "");
  if (raw === "none") {
    chooseProject(db, id, null);
    refresh();
    return { ok: true, message: "Unlinked. The importer will not link it again." };
  }
  const projectId = parseId(raw);
  if (projectId === null) return { ok: false, message: "Choose a project." };
  if (!db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId))
    return { ok: false, message: "That project no longer exists." };
  chooseProject(db, id, projectId);
  refresh();
  return { ok: true, message: "Project saved." };
}

export async function saveNotesAction(
  _previous: SessionActionState,
  formData: FormData,
): Promise<SessionActionState> {
  if (!(await requireSession()) || !(await sameOrigin())) return { ok: false, message: REJECTED };
  const id = parseId(formData.get("id"));
  if (id === null) return { ok: false, message: "Session not found." };
  const notes = cleanText(String(formData.get("notes") ?? "").slice(0, MAX_NOTES_LENGTH), MAX_NOTES_LENGTH, true);
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM ai_sessions WHERE id = ?").get(id))
    return { ok: false, message: "Session not found." };
  saveNotes(db, id, notes);
  refresh();
  return { ok: true, message: notes ? "Notes saved." : "Notes cleared." };
}

/** Removes the saved record and its links. It does not touch the tool's own files. */
export async function deleteSessionAction(formData: FormData): Promise<void> {
  if (!(await requireSession()) || !(await sameOrigin())) return;
  const id = parseId(formData.get("id"));
  if (id === null) return;
  deleteSession(getDb(), id);
  refresh();
  redirect("/sessions");
}
