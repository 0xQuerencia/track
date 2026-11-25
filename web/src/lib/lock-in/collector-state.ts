import {roomPhase} from "./clock";
import type {Session} from "./sessions";
/** Least-privilege projection: no objective, linked records, reports, or owner information. */
export function collectorFocusState(session:Session|null,now:number){
  if(!session||session.endedMs!==null)return {serverNow:now,active:false,phase:"none" as const,paused:false,remainingMs:0};
  const p=roomPhase(session.config,session.clock,Math.max(now,session.clock.startedAtMs,session.clock.pausedAtMs??0));
  return {serverNow:now,active:p.phase!=="complete",phase:p.phase,paused:p.paused,remainingMs:p.remainingMs};
}
