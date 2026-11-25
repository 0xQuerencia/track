import type {Migration} from "./types";
export const migration:Migration={version:191,name:"dreamer_job_disclosures",up(db){
 db.exec("CREATE TABLE dreamer_job_disclosures (job_id TEXT PRIMARY KEY REFERENCES dreamer_jobs(id) ON DELETE CASCADE, approval_sha256 TEXT NOT NULL CHECK(length(approval_sha256)=64))");
}};
