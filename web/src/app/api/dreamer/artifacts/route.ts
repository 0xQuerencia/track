import {cookies} from "next/headers";
import {getDb} from "@/lib/db";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {errorResponse} from "@/lib/integrations/http";
import {missionArtifact,artifactResponse} from "@/lib/dreamer/artifacts";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const token=(await cookies()).get(SESSION_COOKIE)?.value;if(!token||!await verifySessionToken(token))return errorResponse(401,"Unauthorized");
 const q=new URL(request.url).searchParams,id=q.get("id"),format=q.get("format");
 if(!id||!(/^[a-zA-Z0-9_-]{1,80}$/).test(id)||!(format==="txt"||format==="md"||format==="json"))return errorResponse(400,"Invalid artifact request");
 try{const a=missionArtifact(getDb(),id,format);return a?artifactResponse(a):errorResponse(404,"Mission not found");}catch{return errorResponse(409,"Completed report unavailable or exceeds download limit");}
}
