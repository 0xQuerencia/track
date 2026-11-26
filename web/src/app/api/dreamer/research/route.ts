import {cookies} from "next/headers";
import {z} from "zod";
import {getDb} from "@/lib/db";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {verifySameOrigin} from "@/lib/security/origin";
import {jsonResponse,errorResponse,readJsonBody} from "@/lib/integrations/http";
import {namespaceSchema} from "@/lib/dreamer/memory";
import {researchInput,researchConfig} from "@/lib/dreamer/research-connectors";
import {runResearch,listResearch,saveResearchMemory,deleteResearch} from "@/lib/dreamer/research";
export const dynamic="force-dynamic";
const id=z.string().regex(/^research-[a-f0-9-]{36}$/);
const command=z.union([
 z.object({command:z.literal("retrieve"),namespace:namespaceSchema,input:researchInput,confirm:z.literal(true)}).strict(),
 z.object({command:z.literal("save"),namespace:namespaceSchema,id,index:z.number().int().min(0).max(9)}).strict(),
 z.object({command:z.literal("delete"),namespace:namespaceSchema,id,confirm:z.literal(true)}).strict()
]);
async function authorized(){const token=(await cookies()).get(SESSION_COOKIE)?.value;return !!token&&await verifySessionToken(token);}
export async function GET(request:Request){
 if(!await authorized())return errorResponse(401,"Unauthorized");
 const ns=new URL(request.url).searchParams.get("namespace")??"personal";
 if(!namespaceSchema.safeParse(ns).success)return errorResponse(400,"Invalid namespace");
 try{return jsonResponse({ok:true,runs:listResearch(getDb(),ns),config:researchConfig()});}catch{return errorResponse(404,"Research namespace unavailable");}
}
export async function POST(request:Request){
 if(!await authorized())return errorResponse(401,"Unauthorized");
 if(!verifySameOrigin(request).ok)return errorResponse(403,"Origin rejected");
 const body=await readJsonBody(request,4096);if(!body.ok)return body.response;
 const parsed=command.safeParse(body.value);if(!parsed.success)return errorResponse(400,"Invalid research command");
 const c=parsed.data,db=getDb();
 try{
  if(c.command==="retrieve")await runResearch(db,c.namespace,c.input);
  else if(c.command==="save"){const memory=saveResearchMemory(db,c.namespace,c.id,c.index);return jsonResponse({ok:true,memory,runs:listResearch(db,c.namespace)});}
  else deleteResearch(db,c.namespace,c.id);
  return jsonResponse({ok:true,runs:listResearch(db,c.namespace)});
 }catch(e){const safe=["Research connectors are disabled","Repository is not allowlisted","Research connector busy","Research upstream rate limit or access denied","Research upstream unavailable","Research upstream returned non-JSON","Research response too large","Research rate limit reached","Research history limit reached","Research permission changed","Research namespace unavailable","Research result unavailable","Memory limit reached"];return e instanceof Error&&safe.includes(e.message)?errorResponse(409,e.message):errorResponse(500,"Research request failed");}
}
