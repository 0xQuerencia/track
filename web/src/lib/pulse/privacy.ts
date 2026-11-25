import type {DatabaseSync} from "node:sqlite";
export function privacyStatus(db:DatabaseSync){
  const row=db.prepare("SELECT cutoff_ms,paused FROM pulse_privacy WHERE id=1").get();
  if(!row)throw new Error("Pulse privacy not initialized");
  return {cutoffMs:Number(row.cutoff_ms),paused:row.paused===1};
}
export function setCollectionPaused(db:DatabaseSync,paused:boolean){
  db.prepare("UPDATE pulse_privacy SET paused=? WHERE id=1").run(paused?1:0);
}
export function eraseActivity(db:DatabaseSync,now=Date.now()){
  if(!Number.isSafeInteger(now)||now<0)throw new RangeError("Invalid cutoff");
  db.exec("BEGIN IMMEDIATE");
  try{
    db.prepare("UPDATE pulse_privacy SET cutoff_ms=MAX(cutoff_ms,?),paused=1 WHERE id=1").run(now);
    const deleted=db.prepare("DELETE FROM pulse_intervals").run().changes;
    db.exec("COMMIT");return Number(deleted);
  }catch(e){db.exec("ROLLBACK");throw e;}
}
export function exportActivity(db:DatabaseSync,now=Date.now()){
  const rows=db.prepare("SELECT token_id,event_id,source,start_ms,end_ms FROM pulse_intervals WHERE end_ms>=? ORDER BY start_ms,token_id,event_id LIMIT 50001").all(now-30*86400000);
  if(rows.length>50000)throw new RangeError("Activity export exceeds 50000 rows");
  return {version:1,exportedAt:new Date(now).toISOString(),intervals:rows.map(r=>({deviceId:"token-"+r.token_id,eventId:r.event_id,source:r.source,startMs:r.start_ms,endMs:r.end_ms}))};
}
