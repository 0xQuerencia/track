import {authenticate} from "../identity.mjs";
import {friendList,blockedList,requestFriend,acceptFriend,removeFriend,blockAccount,unblockAccount,reportAccount} from "../friends.mjs";
import {HttpError,readJson,respond,exact,limiter} from "../http.mjs";
export function friendRoutes(){
 const mutate=limiter({max:30,windowMs:60000});
 return async({db,req,res,url})=>{
  const p=url.pathname;
  if(!["/v1/friends","/v1/friends/request","/v1/friends/accept","/v1/friends/remove","/v1/blocks","/v1/blocks/add","/v1/blocks/remove","/v1/reports"].includes(p))return false;
  const actor=authenticate(db,req.headers.authorization).id;
  if(req.method==="GET"&&(p==="/v1/friends"||p==="/v1/blocks")){
    respond(res,200,{ok:true,accounts:p==="/v1/friends"?friendList(db,actor):blockedList(db,actor)});return true;
  }
  if(req.method!=="POST")throw new HttpError(405,"Method not allowed");
  if(!mutate(actor))throw new HttpError(429,"Rate limited");
  const input=await readJson(req,4096);
  let result={};
  if(p==="/v1/friends/request")result=requestFriend(db,actor,input);
  else if(p==="/v1/reports")result=reportAccount(db,actor,input);
  else{
    exact(input,["accountId"]);const id=input.accountId;
    if(p==="/v1/friends/accept")result=acceptFriend(db,actor,id);
    else if(p==="/v1/friends/remove")removeFriend(db,actor,id);
    else if(p==="/v1/blocks/add")blockAccount(db,actor,id);
    else if(p==="/v1/blocks/remove")unblockAccount(db,actor,id);
    else throw new HttpError(405,"Method not allowed");
  }
  respond(res,200,{ok:true,...result});return true;
 };
}
