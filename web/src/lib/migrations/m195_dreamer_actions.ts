import type {Migration} from "./types";
export const migration:Migration={version:195,name:"dreamer_action_approvals",up(db){
 db.exec(`CREATE TABLE dreamer_action_drafts(
 id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES dreamer_jobs(id) ON DELETE CASCADE,
 tool TEXT NOT NULL,params_json TEXT NOT NULL,approval_sha256 TEXT NOT NULL,
 report_sha256 TEXT NOT NULL,consent_sha256 TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','applied','rejected','expired','failed')),
 created_ms INTEGER NOT NULL,expires_ms INTEGER NOT NULL,handled_ms INTEGER,
 receipt_json TEXT
 );
 CREATE INDEX dreamer_action_drafts_job ON dreamer_action_drafts(job_id,created_ms);
 CREATE INDEX dreamer_action_drafts_state ON dreamer_action_drafts(state,expires_ms);`);
}};
