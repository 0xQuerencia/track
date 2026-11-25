import type {Migration} from "./types";
export const migration:Migration={version:192,name:"dreamer_worker_heartbeat",up(db){
 db.exec("CREATE TABLE dreamer_worker_heartbeats (id TEXT PRIMARY KEY, seen_ms INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('idle','working','paused','stopped','error')))");
}};
