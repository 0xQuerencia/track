import {cookies} from "next/headers";
import {getDb} from "@/lib/db";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {verifySameOrigin} from "@/lib/security/origin";
import {jsonResponse,errorResponse,readJsonBody} from "@/lib/integrations/http";
import {listMemory,namespaceSchema} from "@/lib/dreamer/memory";
import {parseMemoryCommand,applyMemoryCommand} from "@/lib/dreamer/memory-commands";
export const dynamic="force-dynamic";
async function authorized(){const token=(await cookies()).get(SESSION_COOKIE)?.value;return !!token&&await verifySessionToken(token);}
export async function GET(request:Request){
 if(!await authorized())return errorResponse(401,"Unauthorized");
 const query=new URL(request.url).searchParams,namespace=query.get("namespace")??"personal";
 if(!namespaceSchema.safeParse(namespace).success)return errorResponse(400,"Invalid memory namespace");
 return jsonResponse({ok:true,notes:listMemory(getDb(),namespace,Date.now(),query.get("includeExpired")==="1")});
}
export async function POST(request:Request){
 if(!await authorized())return errorResponse(401,"Unauthorized");
 if(!verifySameOrigin(request).ok)return errorResponse(403,"Origin rejected");
 const body=await readJsonBody(request,16000);if(!body.ok)return body.response;
 const c=parseMemoryCommand(body.value);if(!c)return errorResponse(400,"Invalid memory command");
 try{return jsonResponse({ok:true,...applyMemoryCommand(getDb(),c)});}
 catch(e){const safe=["Memory Pod not found","Memory expiry must be within one year","Memory source is not a completed mission in this namespace","Memory limit reached","Memory changed or not found","Invalid memory selection","Memory selection unavailable"];return e instanceof Error&&safe.includes(e.message)?errorResponse(409,e.message):errorResponse(500,"Memory request failed");}
}
