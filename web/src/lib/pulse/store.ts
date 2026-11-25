import type { DatabaseSync } from "node:sqlite";
import {privacyStatus,pruneExpiredActivity} from "./privacy";
import {categoryTime} from "./category-report";
import type {Category} from "./classification";
import { activityTotals, parseActivityInterval, type ActivityInterval } from "./intervals";
export const RETENTION_MS=30*86400000;
const BATCH_LIMIT=200;
/** Identity is derived from the authenticated token, not the caller's payload. */
export function ingestActivity(db:DatabaseSync,tokenId:number,raw:unknown,now=Date.now()){
  if(!Number.isSafeInteger(tokenId)||tokenId<=0||!Number.isSafeInteger(now)||now<0||!Array.isArray(raw)||raw.length<1||raw.length>BATCH_LIMIT)
    return {ok:false as const,error:"Invalid activity batch"};
  const events:ActivityInterval[]=[];
  for(const item of raw){
    if(typeof item!=="object"||item===null||Array.isArray(item))return {ok:false as const,error:"Invalid interval"};
    const obj=item as Record<string,unknown>;
    if(Object.hasOwn(obj,"deviceId"))return {ok:false as const,error:"Device identity is assigned by server"};
    const event=parseActivityInterval({...obj,deviceId:"token-"+tokenId});
    if(!event||event.startMs<now-RETENTION_MS||event.endMs>now+60000)return {ok:false as const,error:"Invalid interval or timestamp"};
    events.push(event);
  }
  db.exec("BEGIN IMMEDIATE");
  try{
    const find=db.prepare("SELECT source,start_ms,end_ms,category FROM pulse_intervals WHERE token_id=? AND event_id=?");
    const insert=db.prepare("INSERT INTO pulse_intervals(token_id,event_id,source,start_ms,end_ms,received_ms,category) VALUES(?,?,?,?,?,?,?)");
    let inserted=0;
    const privacy=privacyStatus(db);
    for(const e of events){
      // Acknowledged but intentionally discarded while paused or older than the erasure cutoff.
      if(privacy.paused||e.startMs<privacy.cutoffMs)continue;
      const old=find.get(tokenId,e.eventId);
      if(old){
        if(old.source!==e.source||old.start_ms!==e.startMs||old.end_ms!==e.endMs||old.category!==(e.category??null)){
          db.exec("ROLLBACK");
          return {ok:false as const,error:"Conflicting event replay"};
        }
      }else{insert.run(tokenId,e.eventId,e.source,e.startMs,e.endMs,now,e.category??null);inserted++;}
    }
    pruneExpiredActivity(db,now);
    db.exec("COMMIT");
    return {ok:true as const,inserted,ack:events.map(e=>e.eventId)};
  }catch(error){db.exec("ROLLBACK");throw error;}
}
export function readActivity(db:DatabaseSync,startMs:number,endMs:number){
  if(!Number.isSafeInteger(startMs)||!Number.isSafeInteger(endMs)||startMs<0||endMs<=startMs||endMs-startMs>RETENTION_MS)throw new RangeError("Invalid report window");
  const rows=db.prepare("SELECT token_id,event_id,source,start_ms,end_ms,category FROM pulse_intervals WHERE end_ms>? AND start_ms<? ORDER BY start_ms LIMIT 50001").all(startMs,endMs);
  if(rows.length>50000)throw new RangeError("Too many intervals; narrow report window");
  const events=rows.map(r=>({eventId:String(r.event_id),deviceId:"token-"+String(r.token_id),source:String(r.source) as ActivityInterval["source"],startMs:Number(r.start_ms),endMs:Number(r.end_ms),...(r.category===null?{}:{category:String(r.category) as Category})}));
  return {...activityTotals(events,{startMs,endMs}),eventCount:events.length,categoryMs:categoryTime(events.map(e=>({...e,category:e.category??"Other"})),{startMs,endMs})};
}
