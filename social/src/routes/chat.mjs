import {authenticate} from "../identity.mjs";
import {chatList,postMessage,deleteMessage,setMute} from "../chat.mjs";
import {HttpError,readJson,respond,exact,limiter} from "../http.mjs";
export function chatRoutes(){
 const mutate=limiter({max:20,windowMs:60000});
 return async({db,req,res,url})=>{
  const m=/^\/v1\/rooms\/([^/]+)\/chat(?:\/(delete|mute))?$/.exec(url.pathname);
  if(!m)return false;
  const actor=authenticate(db,req.headers.authorization).id,id=m[1],action=m[2];
  if(req.method==="GET"&&!action){const after=url.searchParams.get("after");respond(res,200,{ok:true,...chatList(db,id,actor,after===null?null:Number(after))});return true;}
  if(req.method!=="POST")throw new HttpError(405,"Method not allowed");
  if(!mutate(actor))throw new HttpError(429,"Rate limited");
  const input=await readJson(req,4096);let result={};
  if(action==="delete"){exact(input,["messageId"]);deleteMessage(db,id,actor,input.messageId);}
  else if(action==="mute")setMute(db,id,actor,input);
  else result=postMessage(db,id,actor,input);
  respond(res,200,{ok:true,...result});return true;
 };
}
