import type {Migration} from "./types";
export const migration:Migration={version:199,name:"dreamer_sentinel_watches",up(db){
 db.exec(`CREATE TABLE dreamer_watches(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,repo TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('github_issues','github_pulls')),
 interval_minutes INTEGER NOT NULL,enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),revision INTEGER NOT NULL,
 approval_sha256 TEXT,next_due_ms INTEGER NOT NULL,lease_token TEXT,lease_until_ms INTEGER,
 last_digest TEXT,last_success_ms INTEGER,last_error TEXT,created_ms INTEGER NOT NULL
 );
 CREATE INDEX dreamer_watch_due ON dreamer_watches(enabled,next_due_ms,lease_until_ms);
 CREATE TABLE dreamer_watch_events(
 id TEXT PRIMARY KEY,watch_id TEXT NOT NULL REFERENCES dreamer_watches(id) ON DELETE CASCADE,
 created_ms INTEGER NOT NULL,seen_ms INTEGER,kind TEXT NOT NULL CHECK(kind IN ('baseline','changed')),
 results_json TEXT NOT NULL
 );`);
}};
