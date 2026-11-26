import {cookies} from "next/headers";
import {z} from "zod";
import {getDb} from "@/lib/db";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {verifySameOrigin} from "@/lib/security/origin";
import {jsonResponse,errorResponse,readJsonBody} from "@/lib/integrations/http";
import {researchConfig} from "@/lib/dreamer/research-connectors";
import {watchInput,listWatches,listWatchEvents,saveWatch,deleteWatch,markWatchEventSeen} from "@/lib/dreamer/sentinel";
export const dynamic="force-dynamic";
const id=z.string().regex(/^watch-[a-f0-9-]{36}$/),revision=z.number().int().nonnegative();
const command=z.union([
 z.object({command:z.literal("create"),input:watchInput}).strict(),
 z.object({command:z.literal("edit"),id,revision,input:watchInput}).strict(),
 z.object({command:z.literal("delete"),id,revision,confirm:z.literal(true)}).strict(),
 z.object({command:z.literal("seen"),id:z.string().regex(/^event-[a-f0-9-]{36}$/)}).strict()
]);
async function authorized(){const token=(await cookies()).get(SESSION_COOKIE)?.value;return !!token&&await verifySessionToken(token);}
function snapshot(){const db=getDb();return {watches:listWatches(db),events:listWatchEvents(db),config:{...researchConfig(),sentinelConfigured:process.env.TRACK_DREAMER_SENTINEL_ENABLED==="1"}};}
export async function GET(){if(!await authorized())return errorResponse(401,"Unauthorized");return jsonResponse({ok:true,...snapshot()});}
export async function POST(request:Request){
 if(!await authorized())return errorResponse(401,"Unauthorized");
 if(!verifySameOrigin(request).ok)return errorResponse(403,"Origin rejected");
 const body=await readJsonBody(request,4096);if(!body.ok)return body.response;
 const parsed=command.safeParse(body.value);if(!parsed.success)return errorResponse(400,"Invalid watch command");
 const c=parsed.data,db=getDb();
 try{
  if(c.command==="create")saveWatch(db,c.input);
  else if(c.command==="edit")saveWatch(db,c.input,c.id,c.revision);
  else if(c.command==="delete")deleteWatch(db,c.id,c.revision);
  else markWatchEventSeen(db,c.id);
  return jsonResponse({ok:true,...snapshot()});
 }catch(e){const safe=["Enable Sentinel and allowlist this repository first","Watch limit reached","Watch changed or not found"];return e instanceof Error&&safe.includes(e.message)?errorResponse(409,e.message):errorResponse(500,"Could not update watch");}
}
