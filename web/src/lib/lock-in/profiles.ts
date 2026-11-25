import {DEFAULT_POMODORO,validateConfig,type PomodoroConfig} from "./clock";
const MIN=60000;
export const FOCUS_PROFILES:readonly {name:string;description:string;config:PomodoroConfig}[]=[
  {name:"Classic",description:"25 / 5",config:DEFAULT_POMODORO},
  {name:"Deep work",description:"50 / 10",config:{focusMs:50*MIN,shortBreakMs:10*MIN,longBreakMs:20*MIN,rounds:4,longBreakEvery:4}},
  {name:"Study sprint",description:"90 / 15",config:{focusMs:90*MIN,shortBreakMs:15*MIN,longBreakMs:30*MIN,rounds:2,longBreakEvery:2}},
  {name:"Single block",description:"60 min",config:{focusMs:60*MIN,shortBreakMs:5*MIN,longBreakMs:15*MIN,rounds:1,longBreakEvery:1}},
  {name:"Flow",description:"Count up · end when ready (12h cap)",config:{focusMs:720*MIN,shortBreakMs:5*MIN,longBreakMs:15*MIN,rounds:1,longBreakEvery:1,mode:"flow"}},
];
export function plannedDurationMs(c:PomodoroConfig):number{
  validateConfig(c);
  let total=c.focusMs*c.rounds;
  for(let r=1;r<c.rounds;r++)total+=r%c.longBreakEvery===0?c.longBreakMs:c.shortBreakMs;
  return total;
}
export function validCustomConfig(c:PomodoroConfig):boolean{
  try{return plannedDurationMs(c)<=12*60*MIN;}catch{return false;}
}
