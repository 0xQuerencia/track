import {authenticate} from "../identity.mjs";
import {createPod,listPods,podView,inviteToPod,joinPod,setRole,transferPod,removePodMember,deletePod} from "../pods.mjs";
import {HttpError,readJson,respond,exact,limiter} from "../http.mjs";
export function podRoutes(){
 const mutate=limiter({max:30,windowMs:60000});
 return async({db,req,res,url})=>{
   const match=/^\/v1\/pods(?:\/([^/]+)(?:\/(invite|role|transfer|remove|leave|delete))?)?$/.exec(url.pathname);
   if(!match)return false;
   const actor=authenticate(db,req.headers.authorization).id,pod=match[1],action=match[2];
   if(req.method==="GET"&&!action){respond(res,200,{ok:true,...(pod?{pod:podView(db,pod,actor)}:{pods:listPods(db,actor)})});return true;}
   if(req.method!=="POST")throw new HttpError(405,"Method not allowed");
   if(!mutate(actor))throw new HttpError(429,"Rate limited");
   const input=await readJson(req,4096);let result={};
   if(!pod)result={pod:createPod(db,actor,input)};
   else if(pod==="join"&&!action)result=joinPod(db,actor,input);
   else if(action==="invite")result=inviteToPod(db,pod,actor,input);
   else if(action==="role")setRole(db,pod,actor,input);
   else if(action==="transfer"){exact(input,["accountId"]);transferPod(db,pod,actor,input.accountId);}
   else if(action==="remove"){exact(input,["accountId"]);removePodMember(db,pod,actor,input.accountId);}
   else if(action==="leave"){exact(input,[]);removePodMember(db,pod,actor,actor);}
   else if(action==="delete"){exact(input,["confirmation"]);deletePod(db,pod,actor,input.confirmation);}
   else throw new HttpError(405,"Method not allowed");
   respond(res,200,{ok:true,...result});return true;
 };
}
