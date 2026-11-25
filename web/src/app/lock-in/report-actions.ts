"use server";
import {cookies,headers} from "next/headers";
import {revalidatePath} from "next/cache";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {verifyOriginHeaders} from "@/lib/security/origin";
import {getDb} from "@/lib/db";
import {saveReflection,type Reflection} from "@/lib/lock-in/report";
export async function saveReflectionAction(data:FormData){
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  if(!token||!await verifySessionToken(token)||!verifyOriginHeaders(await headers()).ok)return;
  const id=String(data.get("id")??"");
  try{
    saveReflection(getDb(),id,{outcome:String(data.get("outcome")??"unset") as Reflection["outcome"],distractions:Number(data.get("distractions")),notes:String(data.get("notes")??"")});
    revalidatePath("/lock-in/report/"+id);
  }catch{/* Invalid or missing sessions cannot be edited. */}
}
