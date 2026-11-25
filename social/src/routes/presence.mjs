import {authenticate} from "../identity.mjs";
import {publishPresence,clearPresence,presenceView} from "../presence.mjs";
import {HttpError,readJson,respond,limiter} from "../http.mjs";
export function presenceRoutes(){
 const mutate=limiter({max:30,windowMs:60000});
 return async({db,req,res,url})=>{
   if(url.pathname!=="/v1/presence")return false;
   const actor=authenticate(db,req.headers.authorization).id;
   if(req.method==="GET"){respond(res,200,{ok:true,...presenceView(db,actor)});return true;}
   if(!mutate(actor))throw new HttpError(429,"Rate limited");
   if(req.method==="POST"){respond(res,200,{ok:true,presence:publishPresence(db,actor,await readJson(req,1024))});return true;}
   if(req.method==="DELETE"){clearPresence(db,actor);respond(res,200,{ok:true});return true;}
   throw new HttpError(405,"Method not allowed");
 };
}
