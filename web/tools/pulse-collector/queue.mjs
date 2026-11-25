import fs from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
export const RETENTION_MS=30*86400000,MAX_QUEUE=10000,MAX_BATCH=200;
const ID=/^[a-zA-Z0-9_-]{1,128}$/;
const SOURCES=["desktop","editor","android","manual","browser"],CATEGORIES=["Study","Coding","Media","Social","Games","Other"];
export function validEvent(e){
  return !!e&&ID.test(e.eventId??"")&&SOURCES.includes(e.source)&&Number.isSafeInteger(e.startMs)&&Number.isSafeInteger(e.endMs)&&e.startMs>=0&&e.endMs>e.startMs&&e.endMs-e.startMs<=86400000&&(!e.category||CATEGORIES.includes(e.category))&&Object.keys(e).every(k=>["eventId","source","startMs","endMs","category"].includes(k));
}
export function normalizeQueue(state,now=Date.now()){
  if(state?.version!==1||!Array.isArray(state.events)||!state.events.every(validEvent)||!Number.isSafeInteger(state.dropped)||state.dropped<0)throw new Error("Invalid outbox; preserve the file for recovery.");
  const fresh=state.events.filter(e=>e.startMs>=now-RETENTION_MS),events=fresh.slice(-MAX_QUEUE);
  return {version:1,events,dropped:state.dropped+state.events.length-events.length};
}
export async function loadQueue(file){
  try{return normalizeQueue(JSON.parse(await fs.readFile(file,"utf8")));}
  catch(e){if(e.code==="ENOENT")return {version:1,events:[],dropped:0};throw e;}
}
export async function saveQueue(file,state){
  const safe=normalizeQueue(state);await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const temp=file+"."+randomUUID()+".tmp";
  try{await fs.writeFile(temp,JSON.stringify(safe),{mode:0o600,flag:"wx"});await fs.rename(temp,file);}
  finally{await fs.rm(temp,{force:true});}
  return safe;
}
export function origin(raw){
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash)throw new Error("Use a bare HTTPS Track origin.");
  return u.origin;
}
export function tokenValue(raw){if(!/^trk_[A-Za-z0-9_-]{43}$/.test(raw??""))throw new Error("Set a dedicated activity:write token.");return raw;}
export async function flushBatch(file,state,server,token,fetcher=fetch){
  if(!state.events.length)return state;
  const batch=state.events.slice(0,MAX_BATCH);
  const response=await fetcher(origin(server)+"/api/integrations/activity",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+tokenValue(token)},body:JSON.stringify(batch),redirect:"error",credentials:"omit",signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error("Activity endpoint returned "+response.status);
  const data=await response.json(),sent=new Set(batch.map(e=>e.eventId)),ack=new Set(Array.isArray(data.ack)?data.ack:[]);
  if(data.ok!==true||ack.size!==sent.size||[...ack].some(id=>!sent.has(id)))throw new Error("Incomplete acknowledgment");
  return saveQueue(file,{...state,events:state.events.filter(e=>!ack.has(e.eventId))});
}
export async function lockQueue(file){
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const lock=file+".lock";
  let handle;
  try{handle=await fs.open(lock,"wx",0o600);}
  catch(e){if(e.code==="EEXIST")throw new Error("Collector already running or stale lock. Remove only after confirming it stopped.");throw e;}
  await handle.writeFile(String(process.pid));await handle.close();
  return async()=>fs.rm(lock,{force:true});
}
