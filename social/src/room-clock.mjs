import {HttpError,exact} from "./http.mjs";
const MIN=60000;
export const DEFAULT_CONFIG=Object.freeze({focusMs:25*MIN,shortBreakMs:5*MIN,longBreakMs:15*MIN,rounds:4,longBreakEvery:4});
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export function roomConfig(raw=DEFAULT_CONFIG){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new HttpError(400,"Invalid room timer");
 exact(raw,["focusMs","shortBreakMs","longBreakMs","rounds","longBreakEvery"]);
 const {focusMs,shortBreakMs,longBreakMs,rounds,longBreakEvery}=raw;
 if(!integer(focusMs,MIN,180*MIN)||!integer(shortBreakMs,MIN,60*MIN)||!integer(longBreakMs,MIN,120*MIN)||!integer(rounds,1,24)||!integer(longBreakEvery,1,24))throw new HttpError(400,"Invalid room timer");
 let total=focusMs*rounds;
 for(let r=1;r<rounds;r++)total+=r%longBreakEvery===0?longBreakMs:shortBreakMs;
 if(total>720*MIN)throw new HttpError(400,"Room timer exceeds 12 hours");
 return {focusMs,shortBreakMs,longBreakMs,rounds,longBreakEvery};
}
export function roomClock(row,now){
 const config=roomConfig(JSON.parse(row.config_json));
 const clock={startedMs:row.started_ms,pausedMs:row.paused_ms,pausedTotalMs:row.paused_total_ms,revision:row.revision};
 const result={config,clock,serverNow:now};
 if(row.state==="lobby")return {...result,phase:"waiting",round:0,remainingMs:null,paused:false};
 if(row.state==="ended")return {...result,phase:"ended",round:null,remainingMs:0,paused:false};
 const at=Math.max(row.started_ms,row.paused_ms??0,now);
 let elapsed=Math.max(0,(row.paused_ms??at)-row.started_ms-row.paused_total_ms);
 const paused=row.paused_ms!==null;
 for(let round=1;round<=config.rounds;round++){
  if(elapsed<config.focusMs)return {...result,phase:"focus",round,remainingMs:config.focusMs-elapsed,paused};
  elapsed-=config.focusMs;
  if(round===config.rounds)break;
  const long=round%config.longBreakEvery===0,ms=long?config.longBreakMs:config.shortBreakMs;
  if(elapsed<ms)return {...result,phase:long?"long_break":"short_break",round,remainingMs:ms-elapsed,paused};
  elapsed-=ms;
 }
 return {...result,phase:"complete",round:config.rounds,remainingMs:0,paused:false};
}
