import {cookies} from "next/headers";
import {getDb} from "@/lib/db";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {verifySameOrigin} from "@/lib/security/origin";
import {errorResponse,readJsonBody} from "@/lib/integrations/http";
import {getActionDraft} from "@/lib/dreamer/action-approvals";
import {artifactResponse} from "@/lib/dreamer/artifacts";
import {calendarDraft,emailDraft,emailDraftInput} from "@/lib/dreamer/handoff";
export const dynamic="force-dynamic";
async function authorized(){const token=(await cookies()).get(SESSION_COOKIE)?.value;return !!token&&await verifySessionToken(token);}
export async function GET(request:Request){
 if(!await authorized())return errorResponse(401,"Unauthorized");
 const id=new URL(request.url).searchParams.get("event");if(!id||!/^[a-f0-9]{64}$/.test(id))return errorResponse(400,"Invalid event receipt");
 const draft=getActionDraft(getDb(),id);if(!draft)return errorResponse(404,"Receipt not found");
 try{return artifactResponse(calendarDraft(draft));}catch{return errorResponse(409,"An applied event receipt is required");}
}
export async function POST(request:Request){
 if(!await authorized())return errorResponse(401,"Unauthorized");
 if(!verifySameOrigin(request).ok)return errorResponse(403,"Origin rejected");
 const body=await readJsonBody(request,60000);if(!body.ok)return body.response;
 const parsed=emailDraftInput.safeParse(body.value);if(!parsed.success)return errorResponse(400,"Invalid draft address, subject or body");
 return artifactResponse(emailDraft(parsed.data));
}
