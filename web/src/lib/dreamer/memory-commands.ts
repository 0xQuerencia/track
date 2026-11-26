import type {DatabaseSync} from "node:sqlite";
import {z} from "zod";
import {memoryInput,memoryId,namespaceSchema,listMemory,saveMemory,removeMemory,memoryPreview} from "./memory";
const revision=z.number().int().nonnegative();
const command=z.union([
 z.object({command:z.literal("create"),input:memoryInput}).strict(),
 z.object({command:z.literal("edit"),id:memoryId,revision,input:memoryInput}).strict(),
 z.object({command:z.literal("delete"),id:memoryId,revision,namespace:namespaceSchema,confirm:z.literal(true)}).strict(),
 z.object({command:z.literal("preview"),namespace:namespaceSchema,ids:z.array(memoryId).min(1).max(6)}).strict()
]);
export type MemoryCommand=z.infer<typeof command>;
export function parseMemoryCommand(raw:unknown){const v=command.safeParse(raw);return v.success?v.data:null;}
export function applyMemoryCommand(db:DatabaseSync,c:MemoryCommand){
 if(c.command==="preview")return {preview:memoryPreview(db,c.namespace,c.ids)};
 if(c.command==="delete"){
  if(!listMemory(db,c.namespace,Date.now(),true).some(m=>m.id===c.id&&m.revision===c.revision))throw Error("Memory changed or not found");
  removeMemory(db,c.id,c.revision);return {notes:listMemory(db,c.namespace,Date.now(),true)};
 }
 saveMemory(db,c.input,c.command==="edit"?c.id:undefined,c.command==="edit"?c.revision:undefined);
 return {notes:listMemory(db,c.input.namespace,Date.now(),true)};
}
