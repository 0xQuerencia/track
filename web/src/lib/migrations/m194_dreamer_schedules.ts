import type {Migration} from "./types";
export const migration:Migration={version:194,name:"dreamer_schedules",up(db){
 db.exec(`CREATE TABLE dreamer_schedules(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,objective TEXT NOT NULL,pod_id TEXT,
 timezone TEXT NOT NULL,local_time TEXT NOT NULL,weekday INTEGER CHECK(weekday BETWEEN 0 AND 6),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),revision INTEGER NOT NULL,
 approval_sha256 TEXT,created_ms INTEGER NOT NULL
 );
 CREATE TABLE dreamer_schedule_runs(
 schedule_id TEXT NOT NULL REFERENCES dreamer_schedules(id) ON DELETE CASCADE,
 local_day TEXT NOT NULL,revision INTEGER NOT NULL,job_id TEXT,
 state TEXT NOT NULL CHECK(state IN ('queued','skipped_policy','skipped_capacity')),
 created_ms INTEGER NOT NULL,PRIMARY KEY(schedule_id,local_day)
 );
 CREATE TABLE dreamer_job_schedules(
 job_id TEXT PRIMARY KEY REFERENCES dreamer_jobs(id) ON DELETE CASCADE,
 schedule_id TEXT NOT NULL,revision INTEGER NOT NULL,approval_sha256 TEXT NOT NULL
 );`);
}};
