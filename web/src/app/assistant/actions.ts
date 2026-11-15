"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { setConsent } from "@/lib/ai";
import { converse } from "@/lib/assistant/plan";
import { applyAction, rejectAction, setAutoApply, undoApplied } from "@/lib/assistant/store";
import { getDb } from "@/lib/db";
import { verifyOriginHeaders } from "@/lib/security/origin";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export type ChatState = null | { ok: boolean; message: string; stamp: number };

async function allowed(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
  return verifyOriginHeaders(await headers()).ok;
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/assistant");
  revalidatePath("/health");
  revalidatePath("/plans");
  revalidatePath("/calendar");
}

export async function sendAssistantAction(_prev: ChatState, formData: FormData): Promise<ChatState> {
  if (!(await allowed())) return { ok: false, message: "Request blocked.", stamp: Date.now() };
  const result = await converse(getDb(), String(formData.get("text") ?? ""));
  refresh();
  return result.ok ? { ok: true, message: "", stamp: Date.now() } : { ok: false, message: result.message, stamp: Date.now() };
}

const id = (formData: FormData): number | null => {
  const value = Number(formData.get("id"));
  return Number.isInteger(value) && value > 0 ? value : null;
};

export async function applyAssistantActionAction(formData: FormData): Promise<void> {
  if (!(await allowed())) return;
  const n = id(formData);
  if (n) applyAction(getDb(), n);
  refresh();
}

export async function rejectAssistantActionAction(formData: FormData): Promise<void> {
  if (!(await allowed())) return;
  const n = id(formData);
  if (n) rejectAction(getDb(), n);
  refresh();
}

export async function undoAssistantActionAction(formData: FormData): Promise<void> {
  if (!(await allowed())) return;
  const n = id(formData);
  if (n) undoApplied(getDb(), n);
  refresh();
}

export async function setAssistantConsentAction(formData: FormData): Promise<void> {
  if (!(await allowed())) return;
  setConsent(getDb(), "assistant", formData.get("enabled") === "on");
  refresh();
}

export async function setAutoApplyAction(formData: FormData): Promise<void> {
  if (!(await allowed())) return;
  setAutoApply(getDb(), formData.get("auto") === "on");
  refresh();
}
