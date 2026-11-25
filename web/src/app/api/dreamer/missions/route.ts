import {cookies} from "next/headers";
import {getDb} from "@/lib/db";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {verifySameOrigin} from "@/lib/security/origin";
import {jsonResponse,errorResponse,readJsonBody} from "@/lib/integrations/http";
import {applyJobCommand,parseJobCommand,MissionCommandError} from "@/lib/dreamer/job-commands";
import {getJob,listJobs} from "@/lib/dreamer/jobs";
import {attemptReceipts} from "@/lib/dreamer/job-leases";
import {currentMissionDisclosure,missionPolicyError} from "@/lib/dreamer/job-executor";
import {workerHealth} from "@/lib/dreamer/worker";
export const dynamic="force-dynamic";
async function authorized(){const token=(await cookies()).get(SESSION_COOKIE)?.value;return !!token&&await verifySessionToken(token);}
export async function GET(request:Request){
 if(!await authorized())return errorResponse(401,"Unauthorized");
 const db=getDb(),query=new URL(request.url).searchParams,id=query.get("id");
 try{
  if(id!==null){
   if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))return errorResponse(400,"Invalid mission ID");
   const job=getJob(db,id);if(!job)return errorResponse(404,"Mission not found");
   return jsonResponse({ok:true,job,receipts:attemptReceipts(db,id)});
  }
  return jsonResponse({ok:true,jobs:listJobs(db),worker:workerHealth(db),policy:missionPolicyError(db),...(query.get("preview")==="1"?{disclosure:currentMissionDisclosure(db)}:{})});
 }catch{return errorResponse(500,"Mission data unavailable");}
}
export async function POST(request:Request){
 if(!await authorized())return errorResponse(401,"Unauthorized");
 if(!verifySameOrigin(request).ok)return errorResponse(403,"Origin rejected");
 const body=await readJsonBody(request,12000);if(!body.ok)return body.response;
 const command=parseJobCommand(body.value);if(!command)return errorResponse(400,"Invalid mission command");
 try{return jsonResponse({ok:true,job:applyJobCommand(getDb(),command)});}
 catch(e){return e instanceof MissionCommandError?errorResponse(e.status,e.message):errorResponse(500,"Could not update mission");}
}
