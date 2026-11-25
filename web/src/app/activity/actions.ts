"use server";
import {cookies,headers} from "next/headers";
import {revalidatePath} from "next/cache";
import {getDb} from "@/lib/db";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {verifyOriginHeaders} from "@/lib/security/origin";
import {eraseActivity,setCollectionPaused} from "@/lib/pulse/privacy";
async function allowed(){
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  return !!token&&await verifySessionToken(token)&&verifyOriginHeaders(await headers()).ok;
}
export async function changeCollectionAction(data:FormData){
  if(!await allowed())return;
  const action=data.get("action");
  if(action==="pause"||action==="resume")setCollectionPaused(getDb(),action==="pause");
  if(action==="erase"&&data.get("confirm")==="on")eraseActivity(getDb());
  revalidatePath("/activity");
}
