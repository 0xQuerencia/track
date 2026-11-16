"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { verifyOriginHeaders } from "@/lib/security/origin";
import { configureAgent } from "@/lib/dreamer/agents";
import { runChiefMission } from "@/lib/dreamer/chief";
import { dismissCandidate, saveCandidate } from "@/lib/dreamer/workflows";

export type ChiefFormState = { ok:boolean; message:string; stamp:number } | null;

async function allowed(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
  return verifyOriginHeaders(await headers()).ok;
}

export async function sendChiefMessageAction(_prev: ChiefFormState, data: FormData): Promise<ChiefFormState> {
  if (!(await allowed())) return {ok:false,message:"Request blocked by origin policy.",stamp:Date.now()};
  const objective = String(data.get("objective") ?? "");
  const includeContext = data.get("include_context") === "on";
  const result = await runChiefMission(getDb(), objective, {includeContext});
  revalidatePath("/dreamer");
  return {ok:result.ok,message:result.ok ? "" : result.message,stamp:Date.now()};
}

export async function updateDreamerAgentAction(data:FormData):Promise<void> {
  if (!(await allowed())) return;
  configureAgent(getDb(),String(data.get("key") ?? ""),String(data.get("name") ?? ""),data.get("enabled")==="on");
  revalidatePath("/dreamer");
}

export async function reviewWorkflowCandidateAction(data:FormData):Promise<void> {
  if (!(await allowed())) return;
  const id=Number(data.get("id"));
  const action=String(data.get("action") ?? "");
  if (!Number.isSafeInteger(id)||id<=0) return;
  if (action==="save") saveCandidate(getDb(),id);
  if (action==="dismiss") dismissCandidate(getDb(),id);
  revalidatePath("/dreamer");
}

