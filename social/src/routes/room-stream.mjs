import {createHash} from "node:crypto";
import {authenticate} from "../identity.mjs";
import {roomView} from "../rooms.mjs";
import {HttpError} from "../http.mjs";
export function roomStreamRoutes({tickMs=2000,lifetimeMs=60000,maxStreams=50,maxPerAccount=3}={}){
 let count=0;
 const byAccount=new Map();
 return async({db,req,res,url})=>{
   const match=/^\/v1\/rooms\/([^/]+)\/stream$/.exec(url.pathname);
   if(!match)return false;
   if(req.method!=="GET")throw new HttpError(405,"Method not allowed");
   const auth=req.headers.authorization,actor=authenticate(db,auth).id,id=match[1];
   const initial=roomView(db,id,actor);
   if(count>=maxStreams||(byAccount.get(actor)??0)>=maxPerAccount)throw new HttpError(429,"Too many active streams");
   count++;byAccount.set(actor,(byAccount.get(actor)??0)+1);
   res.writeHead(200,{"content-type":"text/event-stream; charset=utf-8","cache-control":"no-store, no-transform","x-accel-buffering":"no","x-content-type-options":"nosniff","referrer-policy":"no-referrer"});
   let closed=false,timer,expiry;
   const cleanup=()=>{
     if(closed)return;
     closed=true;clearInterval(timer);clearTimeout(expiry);
     count--;const remaining=(byAccount.get(actor)??1)-1;
     if(remaining)byAccount.set(actor,remaining);else byAccount.delete(actor);
   };
   const end=()=>{cleanup();if(!res.writableEnded)res.end();};
   res.once("close",cleanup);res.once("error",cleanup);
   function send(snapshot,reset=false){
     // A cursor identifies a snapshot, not an audit/replay log. Reconnect always reauthorizes and sends a reset.
     const data=JSON.stringify(snapshot);
     const cursor=createHash("sha256").update(data).digest("hex").slice(0,24);
     if(!res.write("id: "+cursor+"\nevent: "+(reset?"reset":"snapshot")+"\ndata: "+data+"\n\n"))end();
   }
   send(initial,true);
   if(!closed){
     timer=setInterval(()=>{
       try{
         if(authenticate(db,auth).id!==actor){end();return;}
         send(roomView(db,id,actor));
       }catch{end();} // Revoked session/membership: never emit another private snapshot.
     },tickMs);
     expiry=setTimeout(end,lifetimeMs);
     timer.unref();expiry.unref();
   }
   return true;
 };
}
