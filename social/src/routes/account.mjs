import {authenticate,authThrottle} from "../identity.mjs";
import {exportAccount,revokeAllSessions,deleteAccount} from "../account-privacy.mjs";
import {HttpError,readJson,respond,exact} from "../http.mjs";
export function accountRoutes(){
 const allow=authThrottle();
 return async({db,req,res,url})=>{
  const path=url.pathname;
  if(!["/v1/account/export","/v1/account/revoke-sessions","/v1/account/delete"].includes(path))return false;
  const actor=authenticate(db,req.headers.authorization).id;
  if(path==="/v1/account/export"&&req.method==="GET"){respond(res,200,{ok:true,data:exportAccount(db,actor)});return true;}
  if(path==="/v1/account/export"||req.method!=="POST")throw new HttpError(405,"Method not allowed");
  if(!allow(actor))throw new HttpError(429,"Too many authentication attempts");
  const input=await readJson(req,2048);
  if(path.endsWith("revoke-sessions")){exact(input,["password"]);await revokeAllSessions(db,actor,input.password);}
  else{exact(input,["password","confirmation"]);await deleteAccount(db,actor,input.password,input.confirmation);}
  respond(res,200,{ok:true});return true;
 };
}
