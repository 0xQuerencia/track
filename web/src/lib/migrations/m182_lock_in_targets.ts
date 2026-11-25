import type {Migration} from "./types";
export const migration:Migration={version:182,name:"lock_in_targets",up(db){
  db.exec("ALTER TABLE lock_in_sessions ADD COLUMN target_type TEXT CHECK(target_type IN ('tasks','projects','chapters'))");
  db.exec("ALTER TABLE lock_in_sessions ADD COLUMN target_id INTEGER CHECK(target_id>0)");
}};
