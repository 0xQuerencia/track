import type {PomodoroConfig} from "./clock";
import {validateConfig} from "./clock";
export type LockInCommand =
  | {command:"start";id:string;label:string;config:PomodoroConfig}
  | {command:"pause"|"resume"|"save"|"discard";id:string;revision:number};
function record(raw:unknown):Record<string,unknown>|null{
  return raw!==null&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
}
export function parseCommand(raw:unknown):LockInCommand|null{
  const r=record(raw);
  if(!r||typeof r.id!=="string"||!/^[a-zA-Z0-9_-]{1,80}$/.test(r.id))return null;
  if(r.command==="start"){
    if(typeof r.label!=="string"||r.label.length>200||Object.keys(r).some(k=>!["command","id","label","config"].includes(k)))return null;
    const c=record(r.config);
    if(!c||Object.keys(c).length!==5)return null;
    const keys=["focusMs","shortBreakMs","longBreakMs","rounds","longBreakEvery"] as const;
    if(keys.some(k=>typeof c[k]!=="number"))return null;
    const config={focusMs:Number(c.focusMs),shortBreakMs:Number(c.shortBreakMs),longBreakMs:Number(c.longBreakMs),rounds:Number(c.rounds),longBreakEvery:Number(c.longBreakEvery)};
    try{validateConfig(config);}catch{return null;}
    return {command:"start",id:r.id,label:r.label,config};
  }
  if(r.command!=="pause"&&r.command!=="resume"&&r.command!=="save"&&r.command!=="discard")return null;
  if(Object.keys(r).some(k=>!["command","id","revision"].includes(k))||typeof r.revision!=="number"||!Number.isSafeInteger(r.revision)||r.revision<0)return null;
  return {command:r.command,id:r.id,revision:r.revision};
}
