import type {Migration} from "./types";
export const migration:Migration={version:193,name:"dreamer_studio",up(db){
 db.exec(`CREATE TABLE dreamer_custom_agents(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,responsibility TEXT NOT NULL,
 effort TEXT NOT NULL CHECK(effort IN ('minimal','low','medium')),
 max_tokens INTEGER NOT NULL CHECK(max_tokens BETWEEN 256 AND 4000),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),revision INTEGER NOT NULL
 );
 CREATE TABLE dreamer_ai_pods(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,
 agents_json TEXT NOT NULL,token_budget INTEGER NOT NULL CHECK(token_budget BETWEEN 8000 AND 100000),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),revision INTEGER NOT NULL
 );
 CREATE TABLE dreamer_job_pods(
 job_id TEXT PRIMARY KEY REFERENCES dreamer_jobs(id) ON DELETE CASCADE,
 pod_id TEXT NOT NULL,configuration_sha256 TEXT NOT NULL
 );`);
}};
