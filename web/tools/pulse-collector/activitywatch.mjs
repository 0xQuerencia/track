import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {loadQueue,saveQueue,flushBatch,lockQueue,origin,tokenValue,RETENTION_MS,MAX_QUEUE} from "./queue.mjs";
import {parseAppRules} from "./collector.mjs";
const MAX_FILE=32*1024*1024,MAX_EVENTS=100000;
function interval(e,from,to){
  if(!e||typeof e.timestamp!=="string"||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(e.timestamp)||typeof e.duration!=="number"||!Number.isFinite(e.duration)||e.duration<=0)return null;
  const start=Date.parse(e.timestamp),end=start+Math.floor(e.duration*1000);
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start)return null;
  const a=Math.max(start,from),b=Math.min(end,to);
  return b>a?{startMs:a,endMs:b}:null;
}
function union(items){
  const out=[];
  for(const r of [...items].sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs)){
    const last=out.at(-1);
    if(last&&r.startMs<=last.endMs)last.endMs=Math.max(last.endMs,r.endMs);
    else out.push({...r});
  }
  return out;
}
/** Explicit matching AFK and window buckets are required. Raw data remains local. */
export function convertActivityWatch(doc,windowId,afkId,{now=Date.now(),days=7,rules=new Map()}={}){
  if(!Number.isSafeInteger(now)||!Number.isInteger(days)||days<1||days>30)throw new Error("Choose 1–30 days");
  const buckets=doc?.buckets;
  const window=buckets&&Object.hasOwn(buckets,windowId)?buckets[windowId]:null;
  const afk=buckets&&Object.hasOwn(buckets,afkId)?buckets[afkId]:null;
  if(window?.type!=="currentwindow"||afk?.type!=="afkstatus"||!Array.isArray(window.events)||!Array.isArray(afk.events)||window.events.length+afk.events.length>MAX_EVENTS||window.hostname!==afk.hostname)throw new Error("Choose matching currentwindow and afkstatus buckets from one device");
  const from=now-days*86400000;
  const active=union(afk.events.filter(e=>e?.data?.status==="not-afk").map(e=>interval(e,from,now)).filter(Boolean));
  const observed=window.events.map(e=>({range:interval(e,from,now),category:typeof e?.data?.app==="string"?rules.get(e.data.app.toLowerCase()):undefined})).filter(e=>e.range).sort((a,b)=>a.range.startMs-b.range.startMs);
  const results=new Map();let cursor=0;
  for(const {range,category} of observed){
    while(cursor<active.length&&active[cursor].endMs<=range.startMs)cursor++;
    for(let i=cursor;i<active.length&&active[i].startMs<range.endMs;i++){
      const a=Math.max(active[i].startMs,range.startMs),b=Math.min(active[i].endMs,range.endMs);
      for(let start=a;start<b;start+=86400000){
        const end=Math.min(b,start+86400000);
        const eventId="aw-"+createHash("sha256").update(JSON.stringify([windowId,start,end,category??null])).digest("hex");
        results.set(eventId,{eventId,source:"desktop",startMs:start,endMs:end,...(category?{category}:{})});
        if(results.size>MAX_QUEUE)throw new Error("Too many imported intervals; choose a shorter period");
      }
    }
  }
  return [...results.values()];
}
export async function main(args=process.argv.slice(2),env=process.env){
  const [file,windowId,afkId,daysRaw="7"]=args.filter(a=>a!=="--send");
  if(!file||!windowId||!afkId)throw new Error("Usage: node activitywatch.mjs export.json WINDOW_BUCKET AFK_BUCKET [days] [--send]");
  const stat=await fs.stat(file);if(!stat.isFile()||stat.size>MAX_FILE)throw new Error("Export exceeds 32 MB or is not a file");
  const events=convertActivityWatch(JSON.parse(await fs.readFile(file,"utf8")),windowId,afkId,{days:Number(daysRaw),rules:parseAppRules(env.TRACK_PULSE_APP_MAP)});
  console.log("Prepared "+events.length+" coarse intervals; raw data stays local.");
  if(!args.includes("--send")){console.log("Dry run; nothing sent.");return;}
  if(env.TRACK_PULSE_ENABLED!=="1")throw new Error("Set TRACK_PULSE_ENABLED=1 to opt in.");
  const server=origin(env.TRACK_PULSE_URL),token=tokenValue(env.TRACK_PULSE_TOKEN);
  const queueFile=path.join(env.XDG_STATE_HOME||path.join(os.homedir(),".local","state"),"track-pulse","activitywatch.json");
  const unlock=await lockQueue(queueFile);
  try{
    let state=await loadQueue(queueFile);
    const combined=new Map([...state.events,...events].filter(e=>e.startMs>=Date.now()-RETENTION_MS).map(e=>[e.eventId,e]));
    if(combined.size>MAX_QUEUE)throw new Error("Pending outbox too large; sync a smaller batch first");
    state=await saveQueue(queueFile,{...state,events:[...combined.values()]});
    while(state.events.length)state=await flushBatch(queueFile,state,server,token);
    console.log("Import acknowledged.");
  }finally{await unlock();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
