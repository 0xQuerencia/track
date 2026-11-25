import {authenticate,authThrottle,register,login,logout} from "../identity.mjs";
import {HttpError,readJson,respond} from "../http.mjs";
export function authRoutes(){
 const allow=authThrottle();
 return async({db,req,res,url})=>{
   const {pathname}=url;
   if(req.method==="POST"&&(pathname==="/v1/auth/register"||pathname==="/v1/auth/login")){
     if(!allow(req.socket.remoteAddress??"unknown"))throw new HttpError(429,"Too many authentication attempts");
     const input=await readJson(req,2048);
     const result=pathname.endsWith("register")?await register(db,input):await login(db,input);
     respond(res,pathname.endsWith("register")?201:200,{ok:true,...result});return true;
   }
   if(req.method==="GET"&&pathname==="/v1/me"){respond(res,200,{ok:true,account:authenticate(db,req.headers.authorization)});return true;}
   if(req.method==="POST"&&pathname==="/v1/auth/logout"){logout(db,req.headers.authorization);respond(res,200,{ok:true});return true;}
   return false;
 };
}
