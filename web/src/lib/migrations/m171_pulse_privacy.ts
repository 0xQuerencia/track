import type {Migration} from "./types";
export const migration:Migration={version:171,name:"pulse_privacy",up(db){
  db.exec("CREATE TABLE IF NOT EXISTS pulse_privacy (id INTEGER PRIMARY KEY CHECK(id=1), cutoff_ms INTEGER NOT NULL DEFAULT 0, paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0,1))); INSERT OR IGNORE INTO pulse_privacy(id) VALUES(1)");
}};
