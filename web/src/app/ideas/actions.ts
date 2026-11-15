"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { IDEA_STATUSES } from "@/lib/entities-ext/ideas-knowledge";
import { convertIdeaToProject, type ConvertResult } from "@/lib/ideas/convert";
import { setIdeaFlag, captureIdea, deleteIdea, saveIdea, setIdeaStatus } from "@/lib/ideas/repo";
import { captureSchema, conversionSchema, firstIssue, ideaSchema } from "@/lib/ideas/schema";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export type ActionState = { ok: boolean; message: string; id?: number } | null;

/** Server actions are public endpoints, so each one re-checks the session. */
async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
}

const refresh = () => revalidatePath("/", "layout");
const idField = z.number().int().positive();

export async function captureIdeaAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();
  const parsed = captureSchema.safeParse({ title: String(formData.get("title") ?? "") });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const id = captureIdea(parsed.data.title);
  refresh();
  return { ok: true, message: "Captured in the Inbox.", id };
}

export async function saveIdeaAction(id: number, values: Record<string, string>): Promise<ActionState> {
  await requireSession();
  if (!idField.safeParse(id).success) return { ok: false, message: "That idea does not exist." };
  const parsed = ideaSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  if (!saveIdea(id, parsed.data)) return { ok: false, message: "That idea no longer exists." };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function setIdeaStatusAction(id: number, status: string): Promise<ActionState> {
  await requireSession();
  const parsedStatus = z.enum(IDEA_STATUSES).safeParse(status);
  if (!idField.safeParse(id).success || !parsedStatus.success) return { ok: false, message: "Unknown status." };
  if (!setIdeaStatus(id, parsedStatus.data)) return { ok: false, message: "That idea no longer exists." };
  refresh();
  return { ok: true, message: `Moved to ${parsedStatus.data}.` };
}

export async function setIdeaFlagAction(id: number, flag: string, value: boolean): Promise<ActionState> {
  await requireSession();
  const name = z.enum(["pinned", "archived"]).safeParse(flag);
  if (!idField.safeParse(id).success || !name.success) return { ok: false, message: "Unknown flag." };
  if (!setIdeaFlag(id, name.data, value === true)) return { ok: false, message: "That idea no longer exists." };
  refresh();
  return { ok: true, message: name.data === "pinned" ? (value ? "Pinned." : "Unpinned.") : value ? "Archived." : "Restored." };
}

export async function deleteIdeaAction(id: number): Promise<void> {
  await requireSession();
  if (!idField.safeParse(id).success) return;
  deleteIdea(id);
  refresh();
  redirect("/ideas");
}

const convertRequest = conversionSchema.extend({
  linkExistingProjectId: z.number().int().positive().nullable(),
});

/** Converts an idea into a project from the approved fields. Idempotent; see lib/ideas/convert.ts. */
export async function convertIdeaAction(
  id: number,
  values: Record<string, string | boolean | number | null>,
): Promise<ConvertResult> {
  await requireSession();
  if (!idField.safeParse(id).success) return { ok: false, error: "That idea does not exist." };
  const parsed = convertRequest.safeParse(values);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = convertIdeaToProject({ ...parsed.data, ideaId: id });
  refresh();
  return result;
}
