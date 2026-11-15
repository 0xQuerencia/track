"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createOpportunity,
  deleteOpportunity,
  parseOpportunityForm,
  setOpportunityStatus,
  updateOpportunity,
} from "@/lib/career/repo";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export type CareerActionState = { ok: boolean; message: string } | null;

/** Server actions are public endpoints, so each one re-checks the session. */
async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
}

const refresh = () => revalidatePath("/", "layout");

const isId = (id: number): boolean => Number.isInteger(id) && id > 0;

export async function createOpportunityAction(
  _previous: CareerActionState,
  formData: FormData,
): Promise<CareerActionState> {
  await requireSession();
  const parsed = parseOpportunityForm(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  createOpportunity(parsed.values);
  refresh();
  return { ok: true, message: "Opportunity added." };
}

export async function updateOpportunityAction(
  id: number,
  _previous: CareerActionState,
  formData: FormData,
): Promise<CareerActionState> {
  await requireSession();
  if (!isId(id)) return { ok: false, message: "Unknown opportunity." };
  const parsed = parseOpportunityForm(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  if (!updateOpportunity(id, parsed.values))
    return { ok: false, message: "Opportunity not found." };
  refresh();
  return { ok: true, message: "Saved." };
}

/** Moves an opportunity to another status. The database records the change in history. */
export async function setOpportunityStatusAction(
  id: number,
  status: string,
): Promise<CareerActionState> {
  await requireSession();
  if (!isId(id)) return { ok: false, message: "Unknown opportunity." };
  if (!setOpportunityStatus(id, status))
    return { ok: false, message: "Unknown status or opportunity." };
  refresh();
  return { ok: true, message: `Moved to ${status}.` };
}

export async function deleteOpportunityAction(id: number): Promise<void> {
  await requireSession();
  if (!isId(id)) return;
  deleteOpportunity(id);
  refresh();
  redirect("/career");
}
