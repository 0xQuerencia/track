import {getDb} from "@/lib/db";
import {authorizeIntegration} from "@/lib/integrations/auth";
import {errorResponse,jsonResponse,readJsonBody} from "@/lib/integrations/http";
import {ingestActivity} from "@/lib/pulse/store";
export const dynamic="force-dynamic";
export async function POST(request:Request){
  const db=getDb();
  const auth=authorizeIntegration(request,"activity:write",db);
  if(!auth.ok)return auth.response;
  const body=await readJsonBody(request,128*1024);
  if(!body.ok)return body.response;
  try{
    const result=ingestActivity(db,auth.tokenId,body.value);
    return result.ok?jsonResponse(result):errorResponse(400,result.error);
  }catch{return errorResponse(500,"Activity ingestion failed.");}
}
