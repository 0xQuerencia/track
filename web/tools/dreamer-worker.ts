import {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import {existsSync} from "node:fs";
import {setTimeout as sleep} from "node:timers/promises";
import {trackDbPath} from "../src/lib/db";
import {runWorkerTick,workerHeartbeat} from "../src/lib/dreamer/worker";

async function main(){
 if(process.env.TRACK_DREAMER_WORKER_ENABLED!=="1"){console.error("Dreamer worker disabled; set TRACK_DREAMER_WORKER_ENABLED=1 explicitly.");process.exitCode=1;return;}
 if(process.argv.slice(2).some(arg=>arg!=="--once"))throw new Error("Unknown worker argument");
 const file=trackDbPath();
 if(file===":memory:"||!existsSync(file))throw new Error("Initialize the Track web database first");
 const db=new DatabaseSync(file);
 const id="worker-"+randomUUID();
 let stop=false;
 const shutdown=()=>{stop=true;};
 process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
 try{
  db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON");
  if(!db.prepare("SELECT version FROM schema_migrations WHERE version=194").get())throw new Error("Start the updated Track web app first to migrate the database");
  workerHeartbeat(db,id,"idle");
  do{
   try{await runWorkerTick(db,id);}catch{workerHeartbeat(db,id,"error");console.error("Dreamer worker tick failed; leased work expires safely.");if(process.argv.includes("--once"))process.exitCode=1;}
   if(stop||process.argv.includes("--once"))break;
   await sleep(2000);
  }while(!stop);
 }finally{
  try{workerHeartbeat(db,id,"stopped");}finally{db.close();process.off("SIGTERM",shutdown);process.off("SIGINT",shutdown);}
 }
}
void main().catch(()=>{console.error("Dreamer worker could not start. Check opt-in, database path and migrations.");process.exitCode=1;});
