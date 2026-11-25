import {getDb} from "@/lib/db";
import {authorizeIntegration} from "@/lib/integrations/auth";
import {jsonResponse} from "@/lib/integrations/http";
import {collectorFocusState} from "@/lib/lock-in/collector-state";
import {activeSession} from "@/lib/lock-in/sessions";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const db=getDb(),auth=authorizeIntegration(request,"focus:read",db);
  if(!auth.ok)return auth.response;
  return jsonResponse({ok:true,...collectorFocusState(activeSession(db),Date.now())});
}
