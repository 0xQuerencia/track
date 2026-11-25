import type {DatabaseSync} from "node:sqlite";
import type {Session} from "./sessions";
import {plannedDurationMs} from "./profiles";
import {readActivity,RETENTION_MS} from "../pulse/store";
export type Reflection={outcome:"yes"|"partial"|"no"|"unset";distractions:number;notes:string};
export function summarizeSession(s:Session,observedMs:number|null){
  if(s.endedMs===null||s.focusMs===null)throw new Error("Session is not complete");
  const wallMs=Math.max(0,s.endedMs-s.clock.startedAtMs);
  const pauseMs=Math.min(wallMs,Math.max(0,s.clock.pausedTotalMs+(s.clock.pausedAtMs===null?0:s.endedMs-s.clock.pausedAtMs)));
  const plannedMs=plannedDurationMs(s.config),activeElapsed=Math.max(0,wallMs-pauseMs);
  const elapsedScheduledMs=Math.min(plannedMs,activeElapsed);
  const scheduledFocusMs=s.config.mode==="flow"?null:s.config.focusMs*s.config.rounds;
  const focusMs=Math.min(elapsedScheduledMs,Math.max(0,s.focusMs));
  const breakMs=Math.max(0,elapsedScheduledMs-focusMs),overdueMs=Math.max(0,activeElapsed-plannedMs);
  const observed=observedMs===null?null:Math.min(wallMs,Math.max(0,observedMs));
  return {wallMs,pauseMs,scheduledFocusMs,focusMs,breakMs,overdueMs,observedMs:observed,unknownMs:observed===null?null:wallMs-observed};
}
export function reportForSession(db:DatabaseSync,s:Session,now=Date.now()){
  if(s.endedMs===null)throw new Error("Session is not complete");
  const start=Math.max(s.clock.startedAtMs,now-RETENTION_MS),end=Math.min(s.endedMs,now);
  let observed:number|null=0;
  if(end>start){
    try{observed=readActivity(db,start,end).uniqueMs;}catch{observed=null;}
  }
  const row=db.prepare("SELECT outcome,distractions,notes FROM lock_in_reflections WHERE session_id=?").get(s.id) as Reflection|undefined;
  return {summary:summarizeSession(s,observed),reflection:row??{outcome:"unset" as const,distractions:0,notes:""},logExists:s.logId!==null&&!!db.prepare("SELECT 1 FROM focus_sessions WHERE id=?").get(s.logId)};
}
export function saveReflection(db:DatabaseSync,id:string,input:Reflection,now=Date.now()){
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||!["yes","partial","no","unset"].includes(input.outcome)||!Number.isInteger(input.distractions)||input.distractions<0||input.distractions>500||typeof input.notes!=="string"||input.notes.length>2000||!Number.isSafeInteger(now))throw new RangeError("Invalid reflection");
  if(!db.prepare("SELECT 1 FROM lock_in_sessions WHERE id=? AND ended_ms IS NOT NULL AND outcome='saved'").get(id))throw new Error("Saved session not found");
  db.prepare(`INSERT INTO lock_in_reflections(session_id,outcome,distractions,notes,updated_ms) VALUES(?,?,?,?,?)
    ON CONFLICT(session_id) DO UPDATE SET outcome=excluded.outcome,distractions=excluded.distractions,notes=excluded.notes,updated_ms=excluded.updated_ms`).run(id,input.outcome,input.distractions,input.notes.trim(),now);
}
