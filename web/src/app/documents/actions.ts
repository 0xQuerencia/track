"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  attachDocumentFile,
  createDocument,
  deleteDocument,
  parseDocumentMeta,
  removeDocumentFile,
  updateDocumentMeta,
} from "@/lib/documents/repo";
import { readUpload } from "@/lib/documents/read-upload";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/*
 * Vault actions. Uploads arrive as multipart FormData through a server action.
 * Each file passes the checks in lib/documents/upload.ts before it is written,
 * and none of its contents or names are logged.
 */

export type DocumentActionState = { ok: boolean; message: string } | null;

/** Server actions are public endpoints, so each one re-checks the session. */
async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
}

const refresh = () => revalidatePath("/", "layout");
const isId = (id: number): boolean => Number.isInteger(id) && id > 0;

export async function createDocumentAction(
  _previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  await requireSession();
  const meta = parseDocumentMeta(formData);
  if ("error" in meta) return { ok: false, message: meta.error };
  const upload = await readUpload(formData.get("file"));
  if (upload && !upload.ok) return { ok: false, message: upload.error };
  const id = await createDocument(meta.values, upload?.file ?? null);
  refresh();
  redirect(`/documents/${id}`);
}

export async function updateDocumentAction(
  id: number,
  _previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  await requireSession();
  if (!isId(id)) return { ok: false, message: "Unknown document." };
  const meta = parseDocumentMeta(formData);
  if ("error" in meta) return { ok: false, message: meta.error };
  if (!updateDocumentMeta(id, meta.values)) return { ok: false, message: "Document not found." };
  refresh();
  return { ok: true, message: "Saved." };
}

/** Adds a file to a document, or replaces the file it already has. */
export async function attachDocumentFileAction(
  id: number,
  _previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  await requireSession();
  if (!isId(id)) return { ok: false, message: "Unknown document." };
  const upload = await readUpload(formData.get("file"));
  if (!upload) return { ok: false, message: "Choose a file first." };
  if (!upload.ok) return { ok: false, message: upload.error };
  if (!(await attachDocumentFile(id, upload.file)))
    return { ok: false, message: "Document not found." };
  refresh();
  return { ok: true, message: "File attached." };
}

export async function removeDocumentFileAction(id: number): Promise<DocumentActionState> {
  await requireSession();
  if (!isId(id)) return { ok: false, message: "Unknown document." };
  if (!(await removeDocumentFile(id))) return { ok: false, message: "Document not found." };
  refresh();
  return { ok: true, message: "File removed. The details are kept." };
}

export async function deleteDocumentAction(id: number): Promise<void> {
  await requireSession();
  if (!isId(id)) return;
  await deleteDocument(id);
  refresh();
  redirect("/documents");
}
