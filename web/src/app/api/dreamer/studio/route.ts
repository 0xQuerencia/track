import {cookies} from "next/headers";
import {getDb} from "@/lib/db";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {verifySameOrigin} from "@/lib/security/origin";
import {jsonResponse,errorResponse,readJsonBody} from "@/lib/integrations/http";
import {studioSnapshot,parseStudioCommand,applyStudioCommand} from "@/lib/dreamer/studio-commands";
export const dynamic="force-dynamic";
async function authorized(){const token=(await cookies()).get(SESSION_COOKIE)?.value;return !!token&&await verifySessionToken(token);}
export async function GET(){
 if(!await authorized())return errorResponse(401,"Unauthorized");
 return jsonResponse({ok:true,...studioSnapshot(getDb())});
}
export async function POST(request:Request){
 if(!await authorized())return errorResponse(401,"Unauthorized");
 if(!verifySameOrigin(request).ok)return errorResponse(403,"Origin rejected");
 const body=await readJsonBody(request,10000);if(!body.ok)return body.response;
 const c=parseStudioCommand(body.value);if(!c)return errorResponse(400,"Invalid Studio configuration");
 try{return jsonResponse({ok:true,...applyStudioCommand(getDb(),c)});}
 catch(e){const safe=["Custom agent limit reached","Agent changed or not found","Unknown pod agent","Pod budget cannot cover one attempt per member","AI pod limit reached","Pod changed or not found"];return e instanceof Error&&safe.includes(e.message)?errorResponse(409,e.message):errorResponse(500,"Could not save configuration");}
}
