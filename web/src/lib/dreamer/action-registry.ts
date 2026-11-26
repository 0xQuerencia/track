import {z} from "zod";
import type {AssistantAction} from "@/lib/assistant/registry";
import {toolDecision,type ToolCapability} from "./mission-policy";
const title=z.string().trim().min(1).max(180);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const n=Date.parse(s+"T00:00:00Z");return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===s;});
const time=z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/);
export const actionInput=z.discriminatedUnion("tool",[
 z.object({tool:z.literal("track.create_task"),params:z.object({title,due:date.optional(),priority:z.enum(["High","Medium","Low"])}).strict()}).strict(),
 z.object({tool:z.literal("track.create_event"),params:z.object({title,date,start_time:time.optional(),end_time:time.optional(),notes:z.string().trim().max(1000).optional()}).strict()}).strict(),
 z.object({tool:z.literal("track.create_note"),params:z.object({title,body:z.string().trim().min(1).max(1800)}).strict()}).strict()
]).refine(a=>a.tool!=="track.create_event"||(!a.params.end_time||!!a.params.start_time&&a.params.end_time>a.params.start_time),"Event end must follow start");
export type ActionInput=z.infer<typeof actionInput>;
export const CAPABILITIES:readonly ToolCapability[]=Object.freeze([
 {name:"track.create_task",scope:"track:task:create",risk:"reversible_write"},
 {name:"track.create_event",scope:"track:event:create",risk:"reversible_write"},
 {name:"track.create_note",scope:"track:note:create",risk:"reversible_write"}
]);
/** Explicit review grants exactly one local create capability, never generic CRUD. */
export function actionDecision(input:ActionInput,enabled:boolean,killSwitch:boolean,consent:boolean){
 const capability=CAPABILITIES.find(c=>c.name===input.tool);
 return toolDecision(CAPABILITIES,input.tool,{enabled,killSwitch,consent,scopes:capability?[capability.scope]:[],allowReversibleWrites:false});
}
export function toAssistantAction(input:ActionInput):AssistantAction{
 const a=actionInput.parse(input);
 if(a.tool==="track.create_task")return {type:"create_record",entity:"tasks",fields:{...a.params,status:"To do",recurrence:"None"}};
 if(a.tool==="track.create_note")return {type:"create_record",entity:"notes",fields:{...a.params,kind:"Note",pinned:false}};
 return {type:"create_record",entity:"events",fields:{...a.params,all_day:!a.params.start_time,recurrence:"None"}};
}
