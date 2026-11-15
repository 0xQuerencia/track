"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createBookmark,
  createCollection,
  createNote,
  deleteBookmark,
  deleteCollection,
  deleteNote,
  setBookmarkPinned,
  setNotePinned,
  updateBookmark,
  updateCollection,
  updateNote,
} from "@/lib/knowledge/repo";
import { bookmarkSchema, collectionSchema, firstIssue, noteSchema } from "@/lib/knowledge/schemas";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export type ActionState = { ok: boolean; message: string; id?: number } | null;

/** Server actions are public endpoints, so each one re-checks the session. */
async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
}

const refresh = () => revalidatePath("/", "layout");
const idField = z.number().int().positive();
const text = (formData: FormData, name: string): string => String(formData.get(name) ?? "");
const checked = (formData: FormData, name: string): boolean => formData.get(name) === "on";

/* ---- notes ---- */

/** Quick note: a title, a kind and an optional collection. The body is written on the detail page. */
export async function createNoteAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();
  const parsed = noteSchema.safeParse({
    title: text(formData, "title"),
    kind: text(formData, "kind") || "Note",
    collection_id: text(formData, "collection_id"),
    tags: "",
    pinned: false,
    body: "",
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const id = createNote(parsed.data);
  refresh();
  redirect(`/knowledge/${id}`);
}

export async function saveNoteAction(id: number, values: Record<string, string | boolean>): Promise<ActionState> {
  await requireSession();
  if (!idField.safeParse(id).success) return { ok: false, message: "That note does not exist." };
  const parsed = noteSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  if (!updateNote(id, parsed.data)) return { ok: false, message: "That note no longer exists." };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function setNotePinnedAction(id: number, pinned: boolean): Promise<ActionState> {
  await requireSession();
  if (!idField.safeParse(id).success) return { ok: false, message: "That note does not exist." };
  if (!setNotePinned(id, pinned === true)) return { ok: false, message: "That note no longer exists." };
  refresh();
  return { ok: true, message: pinned ? "Pinned." : "Unpinned." };
}

export async function deleteNoteAction(id: number): Promise<void> {
  await requireSession();
  if (!idField.safeParse(id).success) return;
  deleteNote(id);
  refresh();
  redirect("/knowledge?tab=notes");
}

/* ---- bookmarks ---- */

function bookmarkInput(formData: FormData) {
  return {
    url: text(formData, "url"),
    title: text(formData, "title"),
    description: text(formData, "description"),
    tags: text(formData, "tags"),
    collection_id: text(formData, "collection_id"),
    pinned: checked(formData, "pinned"),
  };
}

export async function createBookmarkAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();
  const parsed = bookmarkSchema.safeParse(bookmarkInput(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const id = createBookmark(parsed.data);
  refresh();
  return { ok: true, message: "Bookmark saved.", id };
}

export async function updateBookmarkAction(id: number, _previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();
  if (!idField.safeParse(id).success) return { ok: false, message: "That bookmark does not exist." };
  const parsed = bookmarkSchema.safeParse(bookmarkInput(formData));
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  if (!updateBookmark(id, parsed.data)) return { ok: false, message: "That bookmark no longer exists." };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function setBookmarkPinnedAction(id: number, pinned: boolean): Promise<ActionState> {
  await requireSession();
  if (!idField.safeParse(id).success || !setBookmarkPinned(id, pinned === true))
    return { ok: false, message: "That bookmark no longer exists." };
  refresh();
  return { ok: true, message: pinned ? "Pinned." : "Unpinned." };
}

export async function deleteBookmarkAction(id: number): Promise<ActionState> {
  await requireSession();
  if (!idField.safeParse(id).success) return { ok: false, message: "That bookmark does not exist." };
  deleteBookmark(id);
  refresh();
  return { ok: true, message: "Bookmark removed." };
}

/* ---- collections ---- */

export async function createCollectionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();
  const parsed = collectionSchema.safeParse({ name: text(formData, "name"), description: text(formData, "description") });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const id = createCollection(parsed.data);
  refresh();
  return { ok: true, message: "Collection created.", id };
}

export async function updateCollectionAction(id: number, _previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();
  if (!idField.safeParse(id).success) return { ok: false, message: "That collection does not exist." };
  const parsed = collectionSchema.safeParse({ name: text(formData, "name"), description: text(formData, "description") });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  if (!updateCollection(id, parsed.data)) return { ok: false, message: "That collection no longer exists." };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function deleteCollectionAction(id: number): Promise<ActionState> {
  await requireSession();
  if (!idField.safeParse(id).success) return { ok: false, message: "That collection does not exist." };
  if (!deleteCollection(id)) return { ok: false, message: "That collection no longer exists." };
  refresh();
  return { ok: true, message: "Collection deleted. Its notes and bookmarks are kept, unfiled." };
}
