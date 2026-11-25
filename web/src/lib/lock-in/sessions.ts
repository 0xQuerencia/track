import type { DatabaseSync } from "node:sqlite";
import { changeClock,roomPhase,startClock,validateConfig,type ClockState,type PomodoroConfig } from "./clock";

export type Session = {id:string;label:string;config:PomodoroConfig;clock:ClockState;endedMs:number|null;outcome:"saved"|"discarded"|null;focusMs:number|null;logId:number|null};
type Row={id:string;label:string;config_json:string;started_ms:number;paused_ms:number|null;paused_total_ms:number;revision:number;ended_ms:number|null;outcome:Session["outcome"];focus_ms:number|null;log_id:number|null};
function decode(row:Row):Session{
  return {id:row.id,label:row.label,config:JSON.parse(row.config_json) as PomodoroConfig,clock:{startedAtMs:row.started_ms,pausedAtMs:row.paused_ms,pausedTotalMs:row.paused_total_ms,revision:row.revision},endedMs:row.ended_ms,outcome:row.outcome,focusMs:row.focus_ms,logId:row.log_id};
}
const idPattern=/^[a-zA-Z0-9_-]{1,80}$/;
export function getSession(db:DatabaseSync,id:string):Session|null{
  const row=db.prepare("SELECT * FROM lock_in_sessions WHERE id=?").get(id) as Row|undefined;
  return row?decode(row):null;
}
export function activeSession(db:DatabaseSync):Session|null{
  const row=db.prepare("SELECT * FROM lock_in_sessions WHERE ended_ms IS NULL").get() as Row|undefined;
  return row?decode(row):null;
}
export function recentSessions(db:DatabaseSync):Session[]{
  return (db.prepare("SELECT * FROM lock_in_sessions WHERE ended_ms IS NOT NULL ORDER BY ended_ms DESC LIMIT 20").all() as Row[]).map(decode);
}
function transaction<T>(db:DatabaseSync,work:()=>T):T{
  db.exec("BEGIN IMMEDIATE");
  try{const result=work();db.exec("COMMIT");return result;}catch(e){db.exec("ROLLBACK");throw e;}
}
export function beginSession(db:DatabaseSync,id:string,label:string,config:PomodoroConfig,now:number):Session{
  if(!idPattern.test(id)||typeof label!=="string"||label.length>200)throw new Error("Invalid focus objective or ID");
  validateConfig(config);startClock(now);
  // Cap a planned session at twelve hours, including breaks.
  if(config.focusMs*config.rounds+Math.max(config.shortBreakMs,config.longBreakMs)*(config.rounds-1)>12*3600000)throw new Error("Session exceeds twelve hours");
  return transaction(db,()=>{
    const existing=getSession(db,id);
    if(existing){
      if(existing.label!==label.trim()||JSON.stringify(existing.config)!==JSON.stringify(config))throw new Error("Conflicting session replay");
      return existing;
    }
    if(activeSession(db))throw new Error("A session is already active");
    db.prepare("INSERT INTO lock_in_sessions(id,label,config_json,started_ms) VALUES(?,?,?,?)").run(id,label.trim(),JSON.stringify(config),now);
    return getSession(db,id)!;
  });
}
/** Focus-only elapsed time; planned breaks, pause periods and overdue time are excluded. */
export function focusedMs(s:Session,now:number):number{
  const end=Math.min(now,s.endedMs??now);
  roomPhase(s.config,s.clock,end);
  let elapsed=Math.max(0,(s.clock.pausedAtMs??end)-s.clock.startedAtMs-s.clock.pausedTotalMs);
  let focus=0;
  for(let round=1;round<=s.config.rounds;round++){
    focus+=Math.min(elapsed,s.config.focusMs);elapsed=Math.max(0,elapsed-s.config.focusMs);
    if(round<s.config.rounds)elapsed=Math.max(0,elapsed-(round%s.config.longBreakEvery===0?s.config.longBreakMs:s.config.shortBreakMs));
  }
  return focus;
}
export function updateSession(db:DatabaseSync,id:string,revision:number,command:"pause"|"resume"|"save"|"discard",now:number,date:string):Session{
  return transaction(db,()=>{
    const s=getSession(db,id);
    if(!s)throw new Error("Session not found");
    if(s.endedMs!==null){
      if(command==="save"&&s.outcome==="saved"||command==="discard"&&s.outcome==="discarded")return s;
      throw new Error("Session already ended");
    }
    if(s.clock.revision!==revision)throw new Error("Stale session revision");
    if(command==="pause"||command==="resume"){
      const next=changeClock(s.config,s.clock,command,revision,now);
      db.prepare("UPDATE lock_in_sessions SET paused_ms=?,paused_total_ms=?,revision=? WHERE id=?").run(next.pausedAtMs,next.pausedTotalMs,next.revision,id);
    }else{
      const focus=focusedMs(s,now);
      let logId:number|null=null;
      if(command==="save"&&focus>=60000){
        logId=Number(db.prepare("INSERT INTO focus_sessions(date,label,minutes,distractions,notes) VALUES(?,?,?,?,?)").run(date,s.label||null,Math.floor(focus/60000),0,"Lock-in timer; planned focus elapsed, not verified attention.").lastInsertRowid);
      }
      db.prepare("UPDATE lock_in_sessions SET ended_ms=?,outcome=?,focus_ms=?,log_id=?,revision=revision+1 WHERE id=?").run(now,command==="save"?"saved":"discarded",focus,logId,id);
    }
    return getSession(db,id)!;
  });
}
