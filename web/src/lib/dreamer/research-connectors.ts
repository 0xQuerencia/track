import {z} from "zod";
const repoName=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9_.-]{1,100}$/).refine(v=>!v.split("/").some(x=>x==="."||x===".."));
const query=z.string().trim().min(2).max(200);
export const researchInput=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("wikipedia"),query}).strict(),
 z.object({kind:z.literal("crossref"),query}).strict(),
 z.object({kind:z.literal("github_issues"),query:repoName}).strict(),
 z.object({kind:z.literal("github_pulls"),query:repoName}).strict()
]);
export type ResearchInput=z.infer<typeof researchInput>;
export type ResearchResult={title:string;excerpt:string;url:string;source:string};
type Json=Record<string,unknown>;
const object=(v:unknown):Json=>v&&typeof v==="object"&&!Array.isArray(v)?v as Json:{};
const array=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const plain=(v:unknown,max:number)=>typeof v==="string"?v.replace(/<[^>]*>/g," ").replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g," ").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max):"";
export function researchConfig(env:NodeJS.ProcessEnv=process.env){
 const repos=(env.TRACK_DREAMER_GITHUB_REPOS??"").split(",").map(s=>s.trim()).filter(s=>repoName.safeParse(s).success).slice(0,30);
 return {enabled:env.TRACK_DREAMER_RESEARCH_ENABLED==="1",repos:[...new Set(repos)],githubAuthenticated:!!env.TRACK_DREAMER_GITHUB_TOKEN};
}
function requestFor(input:ResearchInput,env:NodeJS.ProcessEnv){
 const config=researchConfig(env);
 if(!config.enabled)throw Error("Research connectors are disabled");
 const headers:Record<string,string>={accept:"application/json","user-agent":"Track-Dreamer-Research/1.0"};
 let url:URL;
 if(input.kind==="wikipedia"){
  url=new URL("https://en.wikipedia.org/w/api.php");
  url.search=new URLSearchParams({action:"query",list:"search",srsearch:input.query,srlimit:"5",format:"json",formatversion:"2"}).toString();
 }else if(input.kind==="crossref"){
  url=new URL("https://api.crossref.org/works");
  url.search=new URLSearchParams({query:input.query,rows:"5",select:"DOI,title,publisher,published,abstract"}).toString();
 }else{
  if(!config.repos.some(r=>r.toLowerCase()===input.query.toLowerCase()))throw Error("Repository is not allowlisted");
  const [owner,repo]=input.query.split("/");
  url=new URL("https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo)+"/"+(input.kind==="github_pulls"?"pulls":"issues"));
  url.search=new URLSearchParams({state:"open",per_page:"10",sort:"updated",direction:"desc"}).toString();
  headers.accept="application/vnd.github+json";
  if(env.TRACK_DREAMER_GITHUB_TOKEN)headers.authorization="Bearer "+env.TRACK_DREAMER_GITHUB_TOKEN;
 }
 return {url,headers};
}
export function extractResearch(input:ResearchInput,payload:unknown):ResearchResult[]{
 let results:ResearchResult[]=[];
 if(input.kind==="wikipedia"){
  results=array(object(object(payload).query).search).flatMap(v=>{
   const r=object(v),title=plain(r.title,180);
   if(!title||typeof r.pageid!=="number"||!Number.isSafeInteger(r.pageid)||r.pageid<1)return [];
   return [{title,excerpt:plain(r.snippet,1000),url:"https://en.wikipedia.org/?curid="+r.pageid,source:"Wikipedia search snippet"}];
  });
 }else if(input.kind==="crossref"){
  results=array(object(object(payload).message).items).flatMap(v=>{
   const r=object(v),title=plain(array(r.title)[0],180),doi=typeof r.DOI==="string"?r.DOI:"";
   if(!title||!/^10\.\d{4,9}\/[!-~]{1,200}$/.test(doi)||doi.split("/").some(x=>x==="."||x===".."))return [];
   const published=array(object(r.published)["date-parts"])[0];
   const year=Array.isArray(published)&&typeof published[0]==="number"?String(published[0]):"";
   return [{title,excerpt:[plain(r.publisher,180),year,plain(r.abstract,800)].filter(Boolean).join(" · "),url:"https://doi.org/"+doi.split("/").map(encodeURIComponent).join("/"),source:"Crossref metadata"}];
  });
 }else{
  results=array(payload).flatMap(v=>{
   const r=object(v),title=plain(r.title,180);
   if(input.kind==="github_issues"&&r.pull_request)return [];
   if(!title||typeof r.number!=="number"||!Number.isSafeInteger(r.number)||r.number<1)return [];
   const kind=input.kind==="github_pulls"?"pull":"issues";
   return [{title:"#"+r.number+" "+title,excerpt:plain(r.body,1000),url:"https://github.com/"+input.query.split("/").map(encodeURIComponent).join("/")+"/"+kind+"/"+r.number,source:input.kind==="github_pulls"?"GitHub pull request":"GitHub issue"}];
  });
 }
 return results.slice(0,10);
}
let inFlight=0;
const MAX_BYTES=1024*1024;
async function boundedJson(response:Response){
 const length=response.headers.get("content-length");
 if(length!==null&&(!Number.isFinite(Number(length))||Number(length)>MAX_BYTES))throw Error("Research response too large");
 if(!response.body)throw Error("Research response missing");
 const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,body="";
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES){await reader.cancel();throw Error("Research response too large");}body+=decoder.decode(value,{stream:true});}body+=decoder.decode();return JSON.parse(body) as unknown;}
 finally{reader.releaseLock();}
}
/** No arbitrary URLs, DNS targets, redirects, model-supplied credentials or executable content. */
export async function fetchResearch(raw:ResearchInput,deps:{env?:NodeJS.ProcessEnv;fetch?:typeof fetch}={}){
 const input=researchInput.parse(raw),{url,headers}=requestFor(input,deps.env??process.env);
 if(inFlight>=2)throw Error("Research connector busy");
 inFlight++;
 try{
  const response=await (deps.fetch??fetch)(url,{headers,redirect:"error",credentials:"omit",cache:"no-store",signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error(response.status===429||response.status===403?"Research upstream rate limit or access denied":"Research upstream unavailable");
  if(!/^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(response.headers.get("content-type")??""))throw Error("Research upstream returned non-JSON");
  return extractResearch(input,await boundedJson(response));
 }finally{inFlight--;}
}
