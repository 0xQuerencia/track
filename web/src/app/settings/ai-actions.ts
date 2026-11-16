"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { setConsent } from "@/lib/ai";
import { verifyOriginHeaders } from "@/lib/security/origin";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const inputSchema = z.object({
  feature: z.literal("dreamer"),
  enabled: z.boolean(),
  allowDailyCycle: z.boolean(),
  maxExcerptChars: z.number().int().min(40).max(2_000),
});

export type AiConsentActionState = { ok: boolean; message: string } | null;

async function isAllowed(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) return false;
  return verifyOriginHeaders(await headers()).ok;
}

/** Saves explicit per-feature consent and its narrowly scoped send limits. */
export async function setAiConsentAction(
  _previous: AiConsentActionState,
  formData: FormData,
): Promise<AiConsentActionState> {
  if (!(await isAllowed())) return { ok: false, message: "Request rejected." };
  const parsed = inputSchema.safeParse({
    feature: formData.get("feature"),
    enabled: formData.get("enabled") === "on",
    allowDailyCycle: formData.get("allowDailyCycle") === "on",
    maxExcerptChars: Number(formData.get("maxExcerptChars")),
  });
  if (!parsed.success) return { ok: false, message: "Check the AI settings and try again." };
  try {
    setConsent(getDb(), parsed.data.feature, parsed.data.enabled, {
      allowDailyCycle: parsed.data.allowDailyCycle,
      maxExcerptChars: parsed.data.maxExcerptChars,
    });
  } catch {
    return { ok: false, message: "AI settings could not be saved." };
  }
  revalidatePath("/settings");
  revalidatePath("/dreamer");
  return { ok: true, message: "AI settings saved." };
}
