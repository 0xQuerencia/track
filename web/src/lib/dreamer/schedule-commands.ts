import {z} from "zod";
import type {DatabaseSync} from "node:sqlite";
import {scheduleInput} from "./schedule-clock";
import {saveSchedule,removeSchedule,listSchedules,scheduleReceipts} from "./schedules";
const id=z.string().regex(/^schedule-[a-f0-9-]{36}$/),revision=z.number().int().nonnegative();
const command=z.union([
 z.object({command:z.literal("create"),input:scheduleInput}).strict(),
 z.object({command:z.literal("edit"),id,revision,input:scheduleInput}).strict(),
 z.object({command:z.literal("delete"),id,revision,confirm:z.literal(true)}).strict()
]);
export type ScheduleCommand=z.infer<typeof command>;
export function parseScheduleCommand(raw:unknown){const v=command.safeParse(raw);return v.success?v.data:null;}
export function scheduleSnapshot(db:DatabaseSync){return {schedules:listSchedules(db),receipts:scheduleReceipts(db),schedulerConfigured:process.env.TRACK_DREAMER_SCHEDULER_ENABLED==="1"};}
export function applyScheduleCommand(db:DatabaseSync,c:ScheduleCommand){
 if(c.command==="create")saveSchedule(db,c.input);
 else if(c.command==="edit")saveSchedule(db,c.input,c.id,c.revision);
 else removeSchedule(db,c.id,c.revision);
 return scheduleSnapshot(db);
}
