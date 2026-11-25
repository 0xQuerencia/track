import type {Migration} from "./types";
export const migration:Migration={version:190,name:"dreamer_durable_jobs",up(db){
 db.exec(`CREATE TABLE dreamer_jobs(
   id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, objective TEXT NOT NULL,
   include_context INTEGER NOT NULL CHECK(include_context IN (0,1)),
   state TEXT NOT NULL CHECK(state IN ('queued','running','complete','failed','cancelled')),
   attempt_budget INTEGER NOT NULL CHECK(attempt_budget BETWEEN 1 AND 24),
   token_budget INTEGER NOT NULL CHECK(token_budget BETWEEN 256 AND 100000),
   attempts_reserved INTEGER NOT NULL DEFAULT 0, tokens_reserved INTEGER NOT NULL DEFAULT 0,
   created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL, finished_ms INTEGER
 );
 CREATE TABLE dreamer_job_steps(
   job_id TEXT NOT NULL REFERENCES dreamer_jobs(id) ON DELETE CASCADE,
   step_id TEXT NOT NULL, ordinal INTEGER NOT NULL, agent_key TEXT NOT NULL,
   depends_json TEXT NOT NULL, max_tokens INTEGER NOT NULL, max_attempts INTEGER NOT NULL,
   state TEXT NOT NULL CHECK(state IN ('queued','running','complete','failed','cancelled')),
   attempt INTEGER NOT NULL DEFAULT 0, available_ms INTEGER NOT NULL,
   lease_token TEXT, lease_until_ms INTEGER, worker_id TEXT,
   output_md TEXT, error_code TEXT, updated_ms INTEGER NOT NULL,
   PRIMARY KEY(job_id,step_id), UNIQUE(job_id,ordinal)
 );
 CREATE INDEX dreamer_jobs_state ON dreamer_jobs(state,created_ms);
 CREATE INDEX dreamer_job_steps_queue ON dreamer_job_steps(state,available_ms,lease_until_ms);
 CREATE TABLE dreamer_job_attempts(
   job_id TEXT NOT NULL, step_id TEXT NOT NULL, attempt INTEGER NOT NULL,
   worker_id TEXT NOT NULL, started_ms INTEGER NOT NULL, finished_ms INTEGER,
   status TEXT NOT NULL CHECK(status IN ('running','complete','failed','expired','cancelled')),
   error_code TEXT, output_sha256 TEXT,
   PRIMARY KEY(job_id,step_id,attempt),
   FOREIGN KEY(job_id,step_id) REFERENCES dreamer_job_steps(job_id,step_id) ON DELETE CASCADE
 );`);
}};
