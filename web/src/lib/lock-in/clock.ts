export type PomodoroConfig = Readonly<{focusMs:number; shortBreakMs:number; longBreakMs:number; rounds:number; longBreakEvery:number;mode?:"flow"}>;
export type Phase = "waiting" | "focus" | "short_break" | "long_break" | "complete";
export type ClockState = Readonly<{startedAtMs:number; pausedAtMs:number|null; pausedTotalMs:number; revision:number}>;
const MIN = 60_000;
export const DEFAULT_POMODORO: PomodoroConfig = {focusMs:25*MIN,shortBreakMs:5*MIN,longBreakMs:15*MIN,rounds:4,longBreakEvery:4};
function integer(value:number,min:number,max:number) {
  return Number.isSafeInteger(value) && value>=min && value<=max;
}
export function validateConfig(c:PomodoroConfig):void {
  if(c.mode!==undefined&&c.mode!=="flow")throw new RangeError("Invalid focus mode");
  if(c.mode==="flow"&&(c.focusMs!==720*MIN||c.rounds!==1))throw new RangeError("Invalid flow configuration");
  if (!integer(c.focusMs,MIN,c.mode==="flow"?720*MIN:180*MIN)||!integer(c.shortBreakMs,MIN,60*MIN)
      ||!integer(c.longBreakMs,MIN,120*MIN)||!integer(c.rounds,1,24)
      ||!integer(c.longBreakEvery,1,24)) throw new RangeError("Invalid Pomodoro configuration");
}
function validateClock(s:ClockState,nowMs:number) {
  if (!integer(nowMs,0,Number.MAX_SAFE_INTEGER)||!integer(s.startedAtMs,0,Number.MAX_SAFE_INTEGER)
      ||!integer(s.pausedTotalMs,0,Math.max(0,(s.pausedAtMs??nowMs)-s.startedAtMs))
      ||!integer(s.revision,0,Number.MAX_SAFE_INTEGER-1)
      ||(s.pausedAtMs!==null&&!integer(s.pausedAtMs,s.startedAtMs,nowMs))) throw new RangeError("Invalid room clock");
}
export function startClock(startedAtMs:number):ClockState {
  const state={startedAtMs,pausedAtMs:null,pausedTotalMs:0,revision:0};
  validateClock(state,startedAtMs);
  return state;
}
/** Server timestamps, not client tick counts, determine phase boundaries. */
export function roomPhase(c:PomodoroConfig,s:ClockState,nowMs:number):{phase:Phase;round:number;remainingMs:number;paused:boolean} {
  validateConfig(c); validateClock(s,nowMs);
  if(nowMs<s.startedAtMs) return {phase:"waiting",round:0,remainingMs:s.startedAtMs-nowMs,paused:false};
  let elapsed=Math.max(0,(s.pausedAtMs??nowMs)-s.startedAtMs-s.pausedTotalMs);
  const paused=s.pausedAtMs!==null;
  for(let round=1;round<=c.rounds;round++){
    if(elapsed<c.focusMs)return {phase:"focus",round,remainingMs:c.focusMs-elapsed,paused};
    elapsed-=c.focusMs;
    if(round===c.rounds)break;
    const long=round%c.longBreakEvery===0;
    const duration=long?c.longBreakMs:c.shortBreakMs;
    if(elapsed<duration)return {phase:long?"long_break":"short_break",round,remainingMs:duration-elapsed,paused};
    elapsed-=duration;
  }
  return {phase:"complete",round:c.rounds,remainingMs:0,paused:false};
}
/** Intended for a server-side compare-and-swap; callers must enforce host permissions. */
export function changeClock(c:PomodoroConfig,s:ClockState,command:"pause"|"resume",expectedRevision:number,nowMs:number):ClockState {
  const phase=roomPhase(c,s,nowMs);
  if(s.revision!==expectedRevision)throw new Error("Stale room revision");
  if(phase.phase==="waiting"||phase.phase==="complete")throw new Error("Room is not active");
  if(command==="pause"&&s.pausedAtMs===null)return {...s,pausedAtMs:nowMs,revision:s.revision+1};
  if(command==="resume"&&s.pausedAtMs!==null)return {...s,pausedAtMs:null,pausedTotalMs:s.pausedTotalMs+nowMs-s.pausedAtMs,revision:s.revision+1};
  throw new Error("Invalid room transition");
}
