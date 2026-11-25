"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { getDb } from "@/lib/db";
import { createIntegrationToken, revokeIntegrationToken } from "@/lib/integrations/tokens";
import { verifyOriginHeaders } from "@/lib/security/origin";
import type { IntegrationScope } from "@/lib/security/integration-tokens";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/*
 * Token management. The raw token leaves the server exactly once, in the
 * result of createIntegrationTokenAction. It is not logged and not stored.
 */

export type TokenActionState =
  | { ok: true; message: string; token: string | null; label: string; scopes: IntegrationScope[] }
  | { ok: false; message: string }
  | null;

async function allowed(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) return false;
  return verifyOriginHeaders(await headers()).ok;
}

export async function createIntegrationTokenAction(
  _previous: TokenActionState,
  formData: FormData,
): Promise<TokenActionState> {
  if (!(await allowed())) return { ok: false, message: "Request rejected." };
  const result = createIntegrationToken(getDb(), formData.get("label"), formData.getAll("scope"));
  if (!result.ok) return { ok: false, message: result.error };
  revalidatePath("/settings");
  revalidatePath("/activity/devices");
  return {
    ok: true,
    message: "Token created. Copy it now: it is shown only once.",
    token: result.token,
    label: result.label,
    scopes: result.scopes,
  };
}

export async function revokeIntegrationTokenAction(formData: FormData): Promise<void> {
  if (!(await allowed())) return;
  revokeIntegrationToken(getDb(), formData.get("id"));
  revalidatePath("/settings");
  revalidatePath("/activity/devices");
}
