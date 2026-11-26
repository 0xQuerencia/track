import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {customAgentInput,podInput,saveCustomAgent,saveAIPod,studioAgents,listAIPods} from "./studio";
const revision=z.number().int().nonnegative();
const agentId=z.string().regex(/^custom-[a-f0-9-]{36}$/),podId=z.string().regex(/^pod-[a-f0-9-]{36}$/);
const command=z.union([
 z.object({command:z.literal("create-agent"),input:customAgentInput}).strict(),
 z.object({command:z.literal("edit-agent"),id:agentId,revision,input:customAgentInput}).strict(),
 z.object({command:z.literal("create-pod"),input:podInput}).strict(),
 z.object({command:z.literal("edit-pod"),id:podId,revision,input:podInput}).strict()
]);
export type StudioCommand=z.infer<typeof command>;
export function parseStudioCommand(raw:unknown){const v=command.safeParse(raw);return v.success?v.data:null;}
export function studioSnapshot(db:DatabaseSync){return {agents:studioAgents(db).map(({brief,...a})=>{void brief;return a;}),pods:listAIPods(db)};}
export function applyStudioCommand(db:DatabaseSync,c:StudioCommand){
 if(c.command==="create-agent")saveCustomAgent(db,c.input);
 else if(c.command==="edit-agent")saveCustomAgent(db,c.input,c.id,c.revision);
 else if(c.command==="create-pod")saveAIPod(db,c.input);
 else saveAIPod(db,c.input,c.id,c.revision);
 return studioSnapshot(db);
}
