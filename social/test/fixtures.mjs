import {randomUUID} from "node:crypto";
export function account(db,handle){
 const id=randomUUID();
 db.prepare("INSERT INTO social_accounts(id,handle,display_name,password_salt,password_hash,created_ms) VALUES(?,?,?,?,?,?)").run(id,handle,handle,"0".repeat(32),"0".repeat(128),1000);
 return id;
}
