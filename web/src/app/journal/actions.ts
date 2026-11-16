"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { deleteRow, insertRow } from "@/lib/crud";
import { getJournalEntry, parseJournalInput, updateJournalEntry } from "@/lib/journal/entries";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export type JournalActionState = { ok: boolean; message: string; id?: number } | null;

/** Server actions are public endpoints, so each one re-checks the session. */
async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
}

const MAX_FIELD_CHARS = 100_000;

/** Turns the submitted object into FormData so the entity's own rules apply. Values are never logged. */
function toFormData(input: unknown): FormData | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const data = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string" || value.length > MAX_FIELD_CHARS) return null;
    data.set(key, value);
  }
  return data;
}

const refresh = (id?: number) => {
  revalidatePath("/journal");
  if (id !== undefined) revalidatePath(`/journal/${id}`);
};

export async function saveJournalAction(input: unknown): Promise<JournalActionState> {
  await requireSession();
  const data = toFormData(input);
  if (!data) return { ok: false, message: "The entry could not be read. Try again." };
  const parsed = parseJournalInput(data);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  const id = insertRow("journal_entries", parsed.values);
  refresh();
  return { ok: true, message: "Entry saved.", id };
}

export async function updateJournalAction(id: number, input: unknown): Promise<JournalActionState> {
  await requireSession();
  if (!getJournalEntry(id)) return { ok: false, message: "Entry not found." };
  const data = toFormData(input);
  if (!data) return { ok: false, message: "The entry could not be read. Try again." };
  const parsed = parseJournalInput(data);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  updateJournalEntry(id, parsed.values);
  refresh(id);
  return { ok: true, message: "Changes saved.", id };
}

/** Deletes an entry and returns to the list. Its links are removed with it. */
export async function deleteJournalAction(id: number): Promise<void> {
  await requireSession();
  if (!getJournalEntry(id)) redirect("/journal");
  deleteRow("journal_entries", id);
  refresh();
  redirect("/journal");
}
