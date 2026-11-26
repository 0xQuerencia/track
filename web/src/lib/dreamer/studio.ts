import type {DatabaseSync} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {listAgents} from "./agents";
const name=z.string().trim().min(2).max(60);
const agentId=z.string().regex(/^custom-[a-f0-9-]{36}$/);
const podId=z.string().regex(/^pod-[a-f0-9-]{36}$/);
const agentKey=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const customAgentInput=z.object({name,responsibility:z.string().trim().min(3).max(1200),effort:z.enum(["minimal","low","medium"]),maxTokens:z.number().int().min(256).max(4000),enabled:z.boolean()}).strict();
export const podInput=z.object({name,description:z.string().trim().max(600),agentKeys:z.array(agentKey).min(1).max(6).refine(a=>new Set(a).size===a.length&&!a.includes("chief")),tokenBudget:z.number().int().min(8000).max(100000),enabled:z.boolean()}).strict();
export type CustomAgentInput=z.infer<typeof customAgentInput>;
export type PodInput=z.infer<typeof podInput>;
export type StudioAgent={key:string;name:string;role:string;brief:string;responsibility:string|null;effort:"minimal"|"low"|"medium";maxTokens:number;enabled:boolean;revision:number;custom:boolean};
export type AIPod=PodInput&{id:string;revision:number};
type CustomRow={id:string;name:string;responsibility:string;effort:StudioAgent["effort"];max_tokens:number;enabled:number;revision:number};
type PodRow={id:string;name:string;description:string;agents_json:string;token_budget:number;enabled:number;revision:number};
export function studioAgents(db:DatabaseSync):StudioAgent[]{
 const built:StudioAgent[]=listAgents(db).map(a=>({...a,responsibility:null,effort:"low",maxTokens:a.key==="chief"?4000:2400,revision:0,custom:false}));
 const custom=(db.prepare("SELECT * FROM dreamer_custom_agents ORDER BY name,id").all() as CustomRow[]).map(a=>({key:a.id,name:a.name,role:"Custom specialist",brief:"Analyze the explicitly supplied objective according to the owner's stated responsibility.",responsibility:a.responsibility,effort:a.effort,maxTokens:a.max_tokens,enabled:!!a.enabled,revision:a.revision,custom:true}));
 return [...built,...custom];
}
const asPod=(r:PodRow):AIPod=>({id:r.id,name:r.name,description:r.description,agentKeys:JSON.parse(r.agents_json) as string[],tokenBudget:r.token_budget,enabled:!!r.enabled,revision:r.revision});
export function listAIPods(db:DatabaseSync){return (db.prepare("SELECT * FROM dreamer_ai_pods ORDER BY name,id").all() as PodRow[]).map(asPod);}
export function getAIPod(db:DatabaseSync,id:string){const row=db.prepare("SELECT * FROM dreamer_ai_pods WHERE id=?").get(id) as PodRow|undefined;return row?asPod(row):null;}
export function saveCustomAgent(db:DatabaseSync,input:CustomAgentInput,id?:string,revision?:number){
 const v=customAgentInput.parse(input);
 if(id===undefined){
  if(Number(db.prepare("SELECT COUNT(*) AS n FROM dreamer_custom_agents").get()?.n)>=30)throw Error("Custom agent limit reached");
  id="custom-"+randomUUID();
  db.prepare("INSERT INTO dreamer_custom_agents VALUES(?,?,?,?,?,?,0)").run(id,v.name,v.responsibility,v.effort,v.maxTokens,v.enabled?1:0);
 }else{
  if(!agentId.safeParse(id).success||!Number.isSafeInteger(revision))throw Error("Invalid agent revision");
  const result=db.prepare("UPDATE dreamer_custom_agents SET name=?,responsibility=?,effort=?,max_tokens=?,enabled=?,revision=revision+1 WHERE id=? AND revision=?").run(v.name,v.responsibility,v.effort,v.maxTokens,v.enabled?1:0,id,revision!);
  if(!result.changes)throw Error("Agent changed or not found");
 }
 return studioAgents(db).find(a=>a.key===id)!;
}
export function saveAIPod(db:DatabaseSync,input:PodInput,id?:string,revision?:number){
 const v=podInput.parse(input),agents=studioAgents(db);
 if(v.agentKeys.some(k=>!agents.some(a=>a.key===k)))throw Error("Unknown pod agent");
 const minimum=4000+v.agentKeys.reduce((n,k)=>n+agents.find(a=>a.key===k)!.maxTokens,0);
 if(v.tokenBudget<minimum)throw Error("Pod budget cannot cover one attempt per member");
 if(id===undefined){
  if(listAIPods(db).length>=30)throw Error("AI pod limit reached");
  id="pod-"+randomUUID();
  db.prepare("INSERT INTO dreamer_ai_pods VALUES(?,?,?,?,?,?,0)").run(id,v.name,v.description,JSON.stringify(v.agentKeys),v.tokenBudget,v.enabled?1:0);
 }else{
  if(!podId.safeParse(id).success||!Number.isSafeInteger(revision))throw Error("Invalid pod revision");
  const result=db.prepare("UPDATE dreamer_ai_pods SET name=?,description=?,agents_json=?,token_budget=?,enabled=?,revision=revision+1 WHERE id=? AND revision=?").run(v.name,v.description,JSON.stringify(v.agentKeys),v.tokenBudget,v.enabled?1:0,id,revision!);
  if(!result.changes)throw Error("Pod changed or not found");
 }
 return getAIPod(db,id)!;
}
export function podConfiguration(db:DatabaseSync,id:string){
 const pod=getAIPod(db,id);
 if(!pod?.enabled)throw Error("AI pod unavailable");
 const agents=studioAgents(db),members=pod.agentKeys.map(k=>agents.find(a=>a.key===k));
 if(members.some(a=>!a?.enabled))throw Error("AI pod has disabled or missing members");
 const team=members as StudioAgent[];
 const digest=createHash("sha256").update(JSON.stringify({pod,team})).digest("hex");
 return {pod,team,digest};
}
export function eraseStudio(db:DatabaseSync){db.exec("DELETE FROM dreamer_ai_pods; DELETE FROM dreamer_custom_agents");}
export function exportStudio(db:DatabaseSync){return {dreamer_custom_agents:db.prepare("SELECT * FROM dreamer_custom_agents").all(),dreamer_ai_pods:db.prepare("SELECT * FROM dreamer_ai_pods").all()};}
