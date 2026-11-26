import {cookies} from "next/headers";
import {getDb} from "@/lib/db";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {verifySameOrigin} from "@/lib/security/origin";
import {jsonResponse,errorResponse,readJsonBody} from "@/lib/integrations/http";
import {scheduleSnapshot,parseScheduleCommand,applyScheduleCommand} from "@/lib/dreamer/schedule-commands";
export const dynamic="force-dynamic";
async function authorized(){const token=(await cookies()).get(SESSION_COOKIE)?.value;return !!token&&await verifySessionToken(token);}
export async function GET(){if(!await authorized())return errorResponse(401,"Unauthorized");return jsonResponse({ok:true,...scheduleSnapshot(getDb())});}
export async function POST(request:Request){
 if(!await authorized())return errorResponse(401,"Unauthorized");
 if(!verifySameOrigin(request).ok)return errorResponse(403,"Origin rejected");
 const body=await readJsonBody(request,10000);if(!body.ok)return body.response;
 const c=parseScheduleCommand(body.value);if(!c)return errorResponse(400,"Invalid schedule");
 try{return jsonResponse({ok:true,...applyScheduleCommand(getDb(),c)});}
 catch(e){const safe=["Enable Dreamer consent and an available team first","Schedule limit reached","Schedule changed or not found"];return e instanceof Error&&safe.includes(e.message)?errorResponse(409,e.message):errorResponse(500,"Could not save schedule");}
}
