import type {DatabaseSync} from "node:sqlite";
import {listTokens} from "../integrations/tokens";
export function listPulseDevices(db:DatabaseSync){
  return listTokens(db).filter(t=>t.scopes.includes("activity:write")).map(token=>{
    const row=db.prepare("SELECT MAX(received_ms) AS last_received,MAX(end_ms) AS last_end,COUNT(*) AS n FROM pulse_intervals WHERE token_id=?").get(token.id)!;
    const sources=db.prepare("SELECT DISTINCT source FROM pulse_intervals WHERE token_id=? ORDER BY source").all(token.id).map(r=>String(r.source));
    return {id:token.id,label:token.label,revokedAt:token.revokedAt,createdAt:token.createdAt,lastUsedAt:token.lastUsedAt,lastReceivedMs:row.last_received===null?null:Number(row.last_received),lastObservedMs:row.last_end===null?null:Number(row.last_end),intervalCount:Number(row.n),sources};
  });
}
