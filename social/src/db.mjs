import {DatabaseSync} from "node:sqlite";
import {mkdirSync,openSync,closeSync,lstatSync,realpathSync,chmodSync} from "node:fs";
import path from "node:path";
import {identitySchema} from "./schema/identity.mjs";
const APP_ID=0x54534f43; // TSOC
const SCHEMA=`CREATE TABLE IF NOT EXISTS social_schema(version INTEGER PRIMARY KEY, applied_ms INTEGER NOT NULL);
INSERT OR IGNORE INTO social_schema VALUES(1,unixepoch()*1000);`;
export function migrate(db){
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
  const app=Number(db.prepare("PRAGMA application_id").get().application_id);
  if(app!==APP_ID){
    const count=Number(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get().n);
    if(app!==0||count!==0)throw new Error("Not a Track Social database; refusing to open");
    db.exec("PRAGMA application_id="+APP_ID);
  }
  db.exec("BEGIN IMMEDIATE");
  try{db.exec(SCHEMA);db.exec("COMMIT");}catch(e){db.exec("ROLLBACK");throw e;}
  applyVersion(db,2,identitySchema);
  return db;
}
/** Deliberately accepts only a dedicated directory; never accepts an existing arbitrary DB path. */
export function openSocialDb(directory){
  if(!directory||!path.isAbsolute(directory))throw new Error("TRACK_SOCIAL_DATA must be an absolute dedicated directory");
  mkdirSync(directory,{recursive:true,mode:0o700});
  const dir=lstatSync(directory);
  if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)!==0)throw new Error("Social data directory must be private (0700), not a symlink");
  const file=path.join(realpathSync(directory),"social-v1.sqlite");
  try{closeSync(openSync(file,"wx",0o600));}catch(e){if(e.code!=="EEXIST")throw e;}
  const stat=lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||(stat.mode&0o077)!==0)throw new Error("Social database must be a private regular file");
  const db=new DatabaseSync(file);
  try{migrate(db);db.exec("PRAGMA journal_mode=WAL");chmodSync(file,0o600);return db;}catch(e){db.close();throw e;}
}
export function applyVersion(db,version,sql){
  transaction(db,()=>{
    if(db.prepare("SELECT 1 FROM social_schema WHERE version=?").get(version))return;
    db.exec(sql);
    db.prepare("INSERT INTO social_schema VALUES(?,?)").run(version,Date.now());
  });
}
export function memoryDb(){return migrate(new DatabaseSync(":memory:"));}
export function transaction(db,work){
  db.exec("BEGIN IMMEDIATE");
  try{const result=work();db.exec("COMMIT");return result;}catch(e){db.exec("ROLLBACK");throw e;}
}
