import {cookies} from "next/headers";
import {getDb} from "@/lib/db";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {exportActivity} from "@/lib/pulse/privacy";
import {errorResponse} from "@/lib/integrations/http";
export const dynamic="force-dynamic";
export async function GET(){
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  if(!token||!await verifySessionToken(token))return errorResponse(401,"Unauthorized");
  try{return Response.json(exportActivity(getDb()),{headers:{"cache-control":"no-store","content-disposition":'attachment; filename="track-activity.json"'}});}
  catch{return errorResponse(413,"Export too large");}
}
