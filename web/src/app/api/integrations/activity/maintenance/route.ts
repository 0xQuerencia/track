import {getDb} from "@/lib/db";
import {authorizeIntegration} from "@/lib/integrations/auth";
import {jsonResponse} from "@/lib/integrations/http";
import {pruneExpiredActivity} from "@/lib/pulse/privacy";
export const dynamic="force-dynamic";
export async function POST(request:Request){
  const db=getDb(),auth=authorizeIntegration(request,"activity:maintenance",db);
  if(!auth.ok)return auth.response;
  return jsonResponse({ok:true,deleted:pruneExpiredActivity(db)});
}
