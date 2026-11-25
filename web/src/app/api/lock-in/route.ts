import {cookies} from "next/headers";
import {getDb} from "@/lib/db";
import {todayStr} from "@/lib/dates";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {verifySameOrigin} from "@/lib/security/origin";
import {jsonResponse,errorResponse,readJsonBody} from "@/lib/integrations/http";
import {parseCommand} from "@/lib/lock-in/commands";
import {activeSession,beginSession,recentSessions,updateSession} from "@/lib/lock-in/sessions";
export const dynamic="force-dynamic";
async function authorized(){
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  return !!token&&await verifySessionToken(token);
}
export async function GET(request:Request){
  if(!await authorized())return errorResponse(401,"Unauthorized");
  const db=getDb();
  const snapshot={ok:true,serverNow:Date.now(),session:activeSession(db)};
  return jsonResponse(new URL(request.url).searchParams.get("active")==="1"?snapshot:{...snapshot,recent:recentSessions(db)});
}
export async function POST(request:Request){
  if(!await authorized())return errorResponse(401,"Unauthorized");
  if(!verifySameOrigin(request).ok)return errorResponse(403,"Origin rejected");
  const body=await readJsonBody(request,4096);
  if(!body.ok)return body.response;
  const c=parseCommand(body.value);
  if(!c)return errorResponse(400,"Invalid command");
  const db=getDb(),now=Date.now();
  try{
    const result=c.command==="start"?beginSession(db,c.id,c.label,c.config,now):updateSession(db,c.id,c.revision,c.command,now,todayStr());
    return jsonResponse({ok:true,serverNow:now,result,session:activeSession(db),recent:recentSessions(db)});
  }catch(error){
    const known=["A session is already active","Conflicting session replay","Session not found","Session already ended","Stale session revision","Room is not active","Invalid room transition","Session exceeds twelve hours"];
    const message=error instanceof Error?error.message:"";
    return errorResponse(known.includes(message)?409:500,known.includes(message)?message:"Could not update session");
  }
}
