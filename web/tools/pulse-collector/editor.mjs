import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {createHash,randomUUID} from "node:crypto";
import {pathToFileURL} from "node:url";
import {loadQueue,saveQueue,flushBatch,lockQueue,origin,tokenValue} from "./queue.mjs";
export const MAX_GAP_MS=60000,MIN_SAMPLE_MS=10000;
/** Only two close, explicit editing events produce an interval. No filenames or content accepted. */
export function editorSample(previous,now){
  if(!Number.isSafeInteger(now)||now<0)throw new RangeError("Invalid clock");
  if(!Number.isSafeInteger(previous)||previous<0||now<previous||now-previous>MAX_GAP_MS)return {next:now,event:null};
  if(now-previous<MIN_SAMPLE_MS)return {next:previous,event:null};
  const eventId="editor-"+createHash("sha256").update(previous+":"+now).digest("hex");
  return {next:now,event:{eventId,source:"editor",category:"Coding",startMs:previous,endMs:now}};
}
async function readPrevious(file){
  try{const value=JSON.parse(await fs.readFile(file,"utf8"));return Number.isSafeInteger(value)?value:null;}
  catch(e){if(e.code==="ENOENT")return null;throw e;}
}
async function writePrevious(file,value){
  const temp=file+"."+randomUUID()+".tmp";
  try{await fs.writeFile(temp,JSON.stringify(value),{mode:0o600,flag:"wx"});await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true});}
}
export async function main(args=process.argv.slice(2),env=process.env){
  const command=args[0]??"";
  if(args.length!==1||!["heartbeat","sync","reset","dry-run"].includes(command))throw new Error("Usage: node editor.mjs heartbeat|sync|reset|dry-run");
  if(command==="dry-run"){console.log("Editor Pulse: opt-in timestamps only. No data written.");return;}
  if(env.TRACK_PULSE_ENABLED!=="1")throw new Error("Enable TRACK_PULSE_ENABLED=1 explicitly.");
  const dir=path.join(env.XDG_STATE_HOME||path.join(os.homedir(),".local","state"),"track-pulse");
  const queueFile=path.join(dir,"editor.json"),stampFile=path.join(dir,"editor-stamp.json");
  const unlock=await lockQueue(queueFile);
  try{
    if(command==="reset"){await fs.rm(stampFile,{force:true});return;}
    let state=await loadQueue(queueFile);
    if(command==="heartbeat"){
      const sample=editorSample(await readPrevious(stampFile),Date.now());
      if(sample.event)state=await saveQueue(queueFile,{...state,events:[...state.events,sample.event]});
      await writePrevious(stampFile,sample.next);
      return;
    }
    const server=origin(env.TRACK_PULSE_URL),token=tokenValue(env.TRACK_PULSE_TOKEN);
    while(state.events.length)state=await flushBatch(queueFile,state,server,token);
    console.log("Editor queue synchronized.");
  }finally{await unlock();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
