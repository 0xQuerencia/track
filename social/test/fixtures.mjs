import {randomUUID,randomBytes,createHash} from "node:crypto";
export function account(db,handle){
 const id=randomUUID();
 db.prepare("INSERT INTO social_accounts(id,handle,display_name,password_salt,password_hash,created_ms) VALUES(?,?,?,?,?,?)").run(id,handle,handle,"0".repeat(32),"0".repeat(128),1000);
 return id;
}

export function bearer(db,id,now=Date.now()){
 const token="ts_"+randomBytes(32).toString("base64url");
 db.prepare("INSERT INTO social_sessions VALUES(?,?,?,?)").run(createHash("sha256").update(token).digest("hex"),id,now,now+86400000);
 return "Bearer "+token;
}
