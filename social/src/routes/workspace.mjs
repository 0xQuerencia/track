import {authenticate} from "../identity.mjs";
import {createItem,listWorkspace,updateItem,deleteItem} from "../workspace.mjs";
import {HttpError,readJson,respond,exact,limiter} from "../http.mjs";
export function workspaceRoutes(){
 const mutate=limiter({max:40,windowMs:60000});
 return async({db,req,res,url})=>{
   const m=/^\/v1\/pods\/([^/]+)\/workspace(?:\/([^/]+))?$/.exec(url.pathname);
   if(!m)return false;
   const actor=authenticate(db,req.headers.authorization).id,[,pod,id]=m;
   if(req.method==="GET"&&!id){respond(res,200,{ok:true,items:listWorkspace(db,pod,actor,url.searchParams.get("kind"))});return true;}
   if(!["POST","PUT","DELETE"].includes(req.method))throw new HttpError(405,"Method not allowed");
   if(!mutate(actor))throw new HttpError(429,"Rate limited");
   const input=await readJson(req,8192);
   if(req.method==="POST"&&!id)respond(res,201,{ok:true,item:createItem(db,pod,actor,input)});
   else if(req.method==="PUT"&&id)respond(res,200,{ok:true,item:updateItem(db,pod,id,actor,input)});
   else if(req.method==="DELETE"&&id){exact(input,["revision"]);deleteItem(db,pod,id,actor,input.revision);respond(res,200,{ok:true});}
   else throw new HttpError(405,"Method not allowed");
   return true;
 };
}
