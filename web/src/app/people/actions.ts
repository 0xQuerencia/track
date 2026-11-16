"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createImportantDate,
  createPerson,
  deleteImportantDate,
  deletePerson,
  parseImportantDateForm,
  parsePersonForm,
  updateImportantDate,
  updatePerson,
} from "@/lib/people/repo";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export type PeopleActionState = { ok: boolean; message: string } | null;

/** Server actions are public endpoints, so each one re-checks the session. */
async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
}

const refresh = () => revalidatePath("/", "layout");
const isId = (id: number): boolean => Number.isInteger(id) && id > 0;

export async function createPersonAction(
  _previous: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  await requireSession();
  const parsed = parsePersonForm(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  createPerson(parsed.values);
  refresh();
  return { ok: true, message: "Person added." };
}

export async function updatePersonAction(
  id: number,
  _previous: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  await requireSession();
  if (!isId(id)) return { ok: false, message: "Unknown person." };
  const parsed = parsePersonForm(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  if (!updatePerson(id, parsed.values)) return { ok: false, message: "Person not found." };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function deletePersonAction(id: number): Promise<void> {
  await requireSession();
  if (!isId(id)) return;
  deletePerson(id);
  refresh();
  redirect("/people");
}

export async function createImportantDateAction(
  _previous: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  await requireSession();
  const parsed = parseImportantDateForm(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  createImportantDate(parsed.values);
  refresh();
  return { ok: true, message: "Date added." };
}

export async function updateImportantDateAction(
  id: number,
  _previous: PeopleActionState,
  formData: FormData,
): Promise<PeopleActionState> {
  await requireSession();
  if (!isId(id)) return { ok: false, message: "Unknown date." };
  const parsed = parseImportantDateForm(formData);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  if (!updateImportantDate(id, parsed.values)) return { ok: false, message: "Date not found." };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function deleteImportantDateAction(id: number): Promise<void> {
  await requireSession();
  if (!isId(id)) return;
  deleteImportantDate(id);
  refresh();
}
