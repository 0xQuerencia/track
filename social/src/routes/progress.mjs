import {authenticate} from "../identity.mjs";
import {publishProgress,revokeProgress,progressView,createChallenge,setChallengeMembership,listChallenges} from "../progress.mjs";
import {HttpError,readJson,respond,exact,limiter} from "../http.mjs";
export function progressRoutes(){
 const mutate=limiter({max:30,windowMs:60000});
 return async({db,req,res,url})=>{
  const m=/^\/v1\/pods\/([^/]+)\/(progress|challenges)(?:\/([^/]+))?$/.exec(url.pathname);
  if(!m)return false;
  const actor=authenticate(db,req.headers.authorization).id,[,pod,kind,id]=m;
  if(req.method==="GET"&&!id){
   const day=url.searchParams.get("day")??new Date().toISOString().slice(0,10);
   respond(res,200,{ok:true,...(kind==="progress"?progressView(db,pod,actor,day):{challenges:listChallenges(db,pod,actor)})});return true;
  }
  if(!mutate(actor))throw new HttpError(429,"Rate limited");
  if(req.method==="DELETE"&&kind==="progress"&&id){revokeProgress(db,pod,actor,id);respond(res,200,{ok:true});return true;}
  if(req.method!=="POST")throw new HttpError(405,"Method not allowed");
  const input=await readJson(req,4096);let result={};
  if(kind==="progress"&&!id)result={progress:publishProgress(db,pod,actor,input)};
  else if(kind==="challenges"&&!id)result=createChallenge(db,pod,actor,input);
  else if(kind==="challenges"){exact(input,["joined"]);setChallengeMembership(db,pod,id,actor,input.joined);}
  else throw new HttpError(405,"Method not allowed");
  respond(res,200,{ok:true,...result});return true;
 };
}
