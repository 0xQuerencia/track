import {authenticate} from "../identity.mjs";
import {createRoom,listRooms,roomView,joinRoom,heartbeatRoom,readyRoom,leaveRoom,transferHost,startRoom,endRoom,changeRoomClock,personalPause} from "../rooms.mjs";
import {HttpError,readJson,respond,exact,limiter} from "../http.mjs";
export function roomRoutes(){
 const mutate=limiter({max:60,windowMs:60000});
 return async({db,req,res,url})=>{
  const listing=/^\/v1\/pods\/([^/]+)\/rooms$/.exec(url.pathname);
  const room=/^\/v1\/rooms\/([^/]+)(?:\/(join|heartbeat|ready|leave|transfer|start|end|pause|resume|personal-pause))?$/.exec(url.pathname);
  if(!listing&&!room)return false;
  const actor=authenticate(db,req.headers.authorization).id,id=room?.[1],action=room?.[2];
  if(req.method==="GET"&&!action){respond(res,200,{ok:true,...(listing?{rooms:listRooms(db,listing[1],actor)}:{room:roomView(db,id,actor)})});return true;}
  if(req.method!=="POST")throw new HttpError(405,"Method not allowed");
  if(!mutate(actor))throw new HttpError(429,"Rate limited");
  const input=await readJson(req,4096);
  if(listing){respond(res,201,{ok:true,room:createRoom(db,listing[1],actor,input)});return true;}
  if(action==="ready"){exact(input,["ready"]);readyRoom(db,id,actor,input.ready);}
  else if(action==="transfer"){exact(input,["accountId","revision"]);transferHost(db,id,actor,input.accountId,input.revision);}
  else if(action==="pause"||action==="resume"){exact(input,["revision"]);changeRoomClock(db,id,actor,action,input.revision);}
  else if(action==="personal-pause"){exact(input,["paused"]);personalPause(db,id,actor,input.paused);}
  else if(action==="start"||action==="end"){exact(input,["revision"]);(action==="start"?startRoom:endRoom)(db,id,actor,input.revision);}
  else{
    exact(input,[]);
    if(action==="join")joinRoom(db,id,actor);
    else if(action==="heartbeat")heartbeatRoom(db,id,actor);
    else if(action==="leave")leaveRoom(db,id,actor);
    else throw new HttpError(405,"Method not allowed");
  }
  respond(res,200,{ok:true,room:roomView(db,id,actor)});return true;
 };
}
