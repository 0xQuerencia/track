import type {DatabaseSync} from "node:sqlite";
export function privacyStatus(db:DatabaseSync){
  const row=db.prepare("SELECT cutoff_ms,paused FROM pulse_privacy WHERE id=1").get();
  if(!row)throw new Error("Pulse privacy not initialized");
  return {cutoffMs:Number(row.cutoff_ms),paused:row.paused===1};
}
export function setCollectionPaused(db:DatabaseSync,paused:boolean,now=Date.now()){
  if(!Number.isSafeInteger(now)||now<0)throw new RangeError("Invalid cutoff");
  // Drop offline samples from before resumption; queued paused-time observations cannot reappear.
  db.prepare("UPDATE pulse_privacy SET cutoff_ms=CASE WHEN paused=1 AND ?=0 THEN MAX(cutoff_ms,?) ELSE cutoff_ms END, paused=? WHERE id=1").run(paused?1:0,now,paused?1:0);
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
  const rows=db.prepare("SELECT token_id,event_id,source,start_ms,end_ms,category FROM pulse_intervals WHERE end_ms>=? ORDER BY start_ms,token_id,event_id LIMIT 50001").all(now-30*86400000);
  if(rows.length>50000)throw new RangeError("Activity export exceeds 50000 rows");
  return {version:1,exportedAt:new Date(now).toISOString(),intervals:rows.map(r=>({deviceId:"token-"+r.token_id,eventId:r.event_id,source:r.source,startMs:r.start_ms,endMs:r.end_ms,category:r.category}))};
}

/** Safe for a scheduler: delete only expired intervals, never recent activity. */
export function pruneExpiredActivity(db:DatabaseSync,now=Date.now()){
  if(!Number.isSafeInteger(now)||now<0)throw new RangeError("Invalid cutoff");
  return Number(db.prepare("DELETE FROM pulse_intervals WHERE end_ms < ?").run(now-30*86400000).changes);
}
/** Revoke a dedicated activity credential and erase its records atomically. */
export function eraseDeviceActivity(db:DatabaseSync,id:number){
  if(!Number.isSafeInteger(id)||id<=0)return false;
  db.exec("BEGIN IMMEDIATE");
  try{
    const row=db.prepare("SELECT scopes FROM integration_tokens WHERE id=?").get(id);
    let scopes:unknown;
    try{scopes=JSON.parse(String(row?.scopes??"[]"));}catch{scopes=[];}
    if(!Array.isArray(scopes)||!scopes.includes("activity:write")){db.exec("ROLLBACK");return false;}
    db.prepare("UPDATE integration_tokens SET revoked_at=COALESCE(revoked_at,datetime('now')) WHERE id=?").run(id);
    db.prepare("DELETE FROM pulse_intervals WHERE token_id=?").run(id);
    db.exec("COMMIT");return true;
  }catch(error){db.exec("ROLLBACK");throw error;}
}
