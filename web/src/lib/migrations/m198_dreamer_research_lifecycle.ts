import type {Migration} from "./types";
export const migration:Migration={version:198,name:"dreamer_research_lifecycle",up(db){
 db.exec("CREATE TABLE dreamer_research_epoch (id INTEGER PRIMARY KEY CHECK(id=1), generation INTEGER NOT NULL); INSERT INTO dreamer_research_epoch VALUES(1,0)");
}};
