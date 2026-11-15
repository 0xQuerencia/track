"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { setConsent } from "@/lib/ai";
import { applyCheckin, discardCheckin, proposeCheckin, type CheckinProposal } from "@/lib/checkin";
import { todayStr } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { verifyOriginHeaders } from "@/lib/security/origin";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export type CheckinState =
  | null
  | { phase: "preview"; id: number; lines: string[] }
  | { phase: "done"; message: string }
  | { phase: "error"; message: string };

async function allowed(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
  return verifyOriginHeaders(await headers()).ok;
}

function previewLines(p: CheckinProposal): string[] {
  const lines: string[] = [];
  if (p.bedtime || p.wake_time) lines.push(`Sleep: ${p.bedtime ?? "?"} to ${p.wake_time ?? "?"}${p.sleep_hours !== null ? ` (${p.sleep_hours} h)` : ""}`);
  else if (p.sleep_hours !== null) lines.push(`Sleep: ${p.sleep_hours} h`);
  if (p.energy !== null) lines.push(`Energy: ${p.energy}/5`);
  if (p.weight_kg !== null) lines.push(`Weight: ${p.weight_kg} kg`);
  if (p.water_l !== null) lines.push(`Water: ${p.water_l} L`);
  if (p.workout) lines.push(`Workout: ${p.workout}`);
  if (p.meals) lines.push(`Meals: ${p.meals}`);
  if (p.notes) lines.push(`Note: ${p.notes}`);
  return lines;
}

export async function proposeCheckinAction(_prev: CheckinState, formData: FormData): Promise<CheckinState> {
  if (!(await allowed())) return { phase: "error", message: "Request blocked." };
  const result = await proposeCheckin(getDb(), String(formData.get("text") ?? ""), todayStr());
  if (!result.ok) return { phase: "error", message: result.message };
  return { phase: "preview", id: result.id, lines: previewLines(result.proposal) };
}

export async function applyCheckinAction(_prev: CheckinState, formData: FormData): Promise<CheckinState> {
  if (!(await allowed())) return { phase: "error", message: "Request blocked." };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { phase: "error", message: "Invalid check-in." };
  if (formData.get("intent") === "discard") {
    discardCheckin(getDb(), id);
    return { phase: "done", message: "Discarded. Nothing was saved." };
  }
  const result = applyCheckin(getDb(), id);
  if (!result.ok) return { phase: "error", message: result.message };
  revalidatePath("/");
  revalidatePath("/health");
  return { phase: "done", message: `Saved: ${result.summary.join(", ")}.` };
}

export async function setCheckinConsentAction(formData: FormData): Promise<void> {
  if (!(await allowed())) return;
  setConsent(getDb(), "checkin", formData.get("enabled") === "on");
  revalidatePath("/");
}
