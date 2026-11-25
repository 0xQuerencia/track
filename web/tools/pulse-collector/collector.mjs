import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {setTimeout as sleep} from "node:timers/promises";
import {randomUUID} from "node:crypto";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {loadQueue,saveQueue,flushBatch,lockQueue,origin,tokenValue} from "./queue.mjs";
const exec=promisify(execFile),CATEGORIES=["Study","Coding","Media","Social","Games","Other"];
export function parseAppRules(raw){
  const parsed=JSON.parse(raw||"{}");
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||Object.keys(parsed).length>100||Object.entries(parsed).some(([k,v])=>!/^[-a-zA-Z0-9_.]{1,100}$/.test(k)||!CATEGORIES.includes(v)))throw new Error("Invalid app category map");
  return new Map(Object.entries(parsed).map(([k,v])=>[k.toLowerCase(),v]));
}
export async function observeX11(env=process.env,runner=exec,rules=new Map()){
  if(!env.DISPLAY||env.XDG_SESSION_TYPE==="wayland")return null;
  const opts={timeout:2000,maxBuffer:4096,env};
  try{
    const idle=Number((await runner("xprintidle",[],opts)).stdout.trim());
    if(!Number.isFinite(idle)||idle<0||idle>=60000)return null;
    const focused=(await runner("xdotool",["getwindowfocus"],opts)).stdout.trim();
    if(!/^\d+$/.test(focused))return null;
    if(!rules.size)return {};
    const raw=(await runner("xprop",["-id",focused,"WM_CLASS"],opts)).stdout;
    const values=[...raw.matchAll(/"([-a-zA-Z0-9_.]{1,100})"/g)].map(m=>m[1].toLowerCase());
    const category=values.map(v=>rules.get(v)).find(Boolean);
    return category?{category}:{};
  }catch{return null;}
}
export function makeSample(previous,now,observed,makeId=randomUUID){
  const next=observed?{at:now,category:observed.category??null}:null;
  if(!previous||!next||now<=previous.at||now-previous.at>90000||previous.category!==next.category)return {next,event:null};
  return {next,event:{eventId:makeId(),source:"desktop",startMs:previous.at,endMs:now,...(next.category?{category:next.category}:{})}};
}
export async function main(env=process.env,args=process.argv.slice(2)){
  const rules=parseAppRules(env.TRACK_PULSE_APP_MAP);
  if(args.includes("--dry-run")){
    const observed=await observeX11(env,exec,rules);
    console.log(observed?"X11 active observation available"+(observed.category?" ("+observed.category+")":""):"Unknown: no active X11 observation. Wayland requires an adapter.");return;
  }
  if(env.TRACK_PULSE_ENABLED!=="1")throw new Error("Opt in with TRACK_PULSE_ENABLED=1; nothing collected by default.");
  if(!env.DISPLAY||env.XDG_SESSION_TYPE==="wayland")throw new Error("This watcher supports X11 only. Use ActivityWatch import for supported Wayland sources.");
  const server=origin(env.TRACK_PULSE_URL),token=tokenValue(env.TRACK_PULSE_TOKEN);
  const file=path.join(env.XDG_STATE_HOME||path.join(os.homedir(),".local","state"),"track-pulse","desktop.json");
  const unlock=await lockQueue(file);
  let stopping=false,previous=null,failures=0,nextSync=0;
  const stop=()=>{stopping=true;};process.once("SIGINT",stop);process.once("SIGTERM",stop);
  try{
    let state=await loadQueue(file);
    do{
      const now=Date.now(),observed=await observeX11(env,exec,rules),sample=makeSample(previous,now,observed);previous=sample.next;
      if(sample.event)state=await saveQueue(file,{...state,events:[...state.events,sample.event]});
      if(now>=nextSync&&state.events.length){
        try{state=await flushBatch(file,state,server,token);failures=0;nextSync=0;}
        catch{failures++;nextSync=Date.now()+Math.min(900000,30000*2**Math.min(failures-1,5));console.error("Pulse sync unavailable; queue retained.");}
      }
      if(!stopping&&!args.includes("--once"))await sleep(30000);
    }while(!stopping&&!args.includes("--once"));
  }finally{process.removeListener("SIGINT",stop);process.removeListener("SIGTERM",stop);await unlock();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
