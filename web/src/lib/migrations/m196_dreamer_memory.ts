import type {Migration} from "./types";
export const migration:Migration={version:196,name:"dreamer_scoped_memory",up(db){
 db.exec(`CREATE TABLE dreamer_memory(
 id TEXT PRIMARY KEY,namespace TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,
 source_job_id TEXT REFERENCES dreamer_jobs(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL DEFAULT 0,created_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL,expires_ms INTEGER
 );
 CREATE INDEX dreamer_memory_namespace ON dreamer_memory(namespace,updated_ms);
 CREATE TABLE dreamer_job_memory(
 job_id TEXT PRIMARY KEY REFERENCES dreamer_jobs(id) ON DELETE CASCADE,
 ids_json TEXT NOT NULL,approval_sha256 TEXT NOT NULL
 );`);
}};
