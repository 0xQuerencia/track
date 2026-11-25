import type {Migration} from "./types";
export const migration:Migration={version:172,name:"pulse_categories",up(db){
  const cols=db.prepare("PRAGMA table_info(pulse_intervals)").all();
  if(!cols.some(c=>c.name==="category"))db.exec("ALTER TABLE pulse_intervals ADD COLUMN category TEXT CHECK(category IS NULL OR category IN ('Study','Coding','Media','Social','Games','Other'))");
}};
