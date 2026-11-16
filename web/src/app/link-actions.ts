"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { addLink, removeLink } from "@/lib/links";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export type LinkActionState = { ok: boolean; message: string };

/** Server actions are public endpoints, so each one re-checks the session. */
async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
}

const refresh = () => revalidatePath("/", "layout");

export async function addLinkAction(
  from: { type: string; id: string },
  to: { type: string; id: string },
  relation?: string,
): Promise<LinkActionState> {
  await requireSession();
  const result = addLink({ from, to, relation });
  if (!result.ok) return { ok: false, message: result.error };
  refresh();
  return {
    ok: true,
    message: result.created ? "Linked." : "Already linked.",
  };
}

export async function removeLinkAction(linkId: number): Promise<LinkActionState> {
  await requireSession();
  if (!removeLink(linkId)) return { ok: false, message: "Link not found." };
  refresh();
  return { ok: true, message: "Unlinked." };
}
