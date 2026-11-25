import {transaction} from "./db.mjs";
export function listReports(db){
 return db.prepare("SELECT id,reporter,subject,reason,created_ms,status FROM social_reports WHERE status='open' ORDER BY created_ms,id LIMIT 100").all().map(r=>({...r}));
}
export function showReport(db,id){
 if(typeof id!=="string"||id.length>80)throw new Error("Invalid report ID");
 const row=db.prepare("SELECT id,reporter,subject,reason,note,created_ms,status,resolved_ms FROM social_reports WHERE id=?").get(id);
 if(!row)throw new Error("Report not found");
 return {...row};
}
export function resolveReport(db,id,now=Date.now()){
 return transaction(db,()=>{
  const report=showReport(db,id);
  if(report.status==="resolved")return false;
  db.prepare("UPDATE social_reports SET status='resolved',resolved_ms=? WHERE id=?").run(now,id);
  db.prepare("INSERT INTO social_admin_audit(action,subject_id,created_ms) VALUES('report_resolved',?,?)").run(id,now);
  return true;
 });
}
