import type {Migration} from "./types";
export const migration:Migration={version:197,name:"dreamer_research_receipts",up(db){
 db.exec(`CREATE TABLE dreamer_research_runs(
 id TEXT PRIMARY KEY,namespace TEXT NOT NULL,kind TEXT NOT NULL,query TEXT NOT NULL,
 results_json TEXT NOT NULL,fetched_ms INTEGER NOT NULL
 );
 CREATE INDEX dreamer_research_namespace ON dreamer_research_runs(namespace,fetched_ms);
 CREATE TABLE dreamer_research_memories(
 memory_id TEXT PRIMARY KEY REFERENCES dreamer_memory(id) ON DELETE CASCADE,
 run_id TEXT NOT NULL REFERENCES dreamer_research_runs(id) ON DELETE CASCADE,
 result_index INTEGER NOT NULL
 );`);
}};
