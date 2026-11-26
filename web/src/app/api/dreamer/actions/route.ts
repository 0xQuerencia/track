import {cookies} from "next/headers";
import {z} from "zod";
import {getDb} from "@/lib/db";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {verifySameOrigin} from "@/lib/security/origin";
import {jsonResponse,errorResponse,readJsonBody} from "@/lib/integrations/http";
import {actionPreview,draftFromReport} from "@/lib/dreamer/action-drafting";
import {listActionDrafts,handleActionDraft,actionSource,actionConsent,storeActionDrafts} from "@/lib/dreamer/action-approvals";
import {actionInput} from "@/lib/dreamer/action-registry";
export const dynamic="force-dynamic";
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),digest=z.string().regex(/^[a-f0-9]{64}$/);
const command=z.union([
 z.object({command:z.literal("draft"),jobId:id,requestId:id,reportSha256:digest}).strict(),
 z.object({command:z.literal("manual"),jobId:id,requestId:id,reportSha256:digest,input:actionInput}).strict(),
 z.object({command:z.enum(["approve","reject"]),id:digest,approvalSha256:digest}).strict()
]);
async function authorized(){const token=(await cookies()).get(SESSION_COOKIE)?.value;return !!token&&await verifySessionToken(token);}
export async function GET(request:Request){
 if(!await authorized())return errorResponse(401,"Unauthorized");
 const db=getDb(),jobId=new URL(request.url).searchParams.get("job");
 if(jobId!==null&&!id.safeParse(jobId).success)return errorResponse(400,"Invalid mission ID");
 try{return jsonResponse({ok:true,drafts:listActionDrafts(db,jobId??undefined),...(jobId?{preview:actionPreview(db,jobId)}:{})});}
 catch{return errorResponse(404,"Completed mission not available");}
}
export async function POST(request:Request){
 if(!await authorized())return errorResponse(401,"Unauthorized");
 if(!verifySameOrigin(request).ok)return errorResponse(403,"Origin rejected");
 const body=await readJsonBody(request,12000);if(!body.ok)return body.response;
 const parsed=command.safeParse(body.value);if(!parsed.success)return errorResponse(400,"Invalid action request");
 const c=parsed.data,db=getDb();
 try{
  if(c.command==="draft")return jsonResponse({ok:true,drafts:await draftFromReport(db,c.jobId,c.requestId,c.reportSha256)});
  if(c.command==="manual"){
   const source=actionSource(db,c.jobId),consent=actionConsent(db);
   if(!consent||source.sha256!==c.reportSha256)return errorResponse(409,"Report or consent changed");
   storeActionDrafts(db,c.requestId,c.jobId,[c.input],source.sha256,consent);
   return jsonResponse({ok:true,drafts:listActionDrafts(db,c.jobId)});
  }
  const result=handleActionDraft(db,c.id,c.approvalSha256,c.command);
  return jsonResponse({ok:true,draft:result,drafts:listActionDrafts(db)});
 }catch(e){const allowed=["AI delegation unavailable","Report changed; review it again","Could not generate valid action drafts","Report or consent changed","Mission draft limit reached","Pending draft limit reached","Conflicting draft replay","Draft or approval not found","Draft integrity check failed","A completed Chief report is required"];return e instanceof Error&&allowed.includes(e.message)?errorResponse(409,e.message):errorResponse(500,"Action request failed");}
}
