import {getJob,type DurableJob} from "./jobs";
import {attemptReceipts} from "./job-leases";
import type {DatabaseSync} from "node:sqlite";
export type Artifact={filename:string;contentType:string;body:string};
export type ReportFormat="txt"|"md"|"json";
const MAX_BYTES=512*1024;
const iso=(n:number|null)=>n===null?null:new Date(n).toISOString();
export function renderReport(job:DurableJob,receipts:ReturnType<typeof attemptReceipts>,format:ReportFormat):Artifact{
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(job.id)||job.state!=="complete"||!job.steps.some(s=>s.agentKey==="chief"&&s.state==="complete"&&s.outputMd))throw Error("A completed mission is required");
 if(!["txt","md","json"].includes(format))throw Error("Unknown format");
 // Export saved output only, not live lease capability, private context previews or provider secrets.
 const data={schemaVersion:1,missionId:job.id,objective:job.objective,finishedAt:iso(job.finishedMs),notice:"Model-generated reports are untrusted text; verify conclusions before acting.",steps:job.steps.map(s=>({id:s.id,agent:s.agentKey,state:s.state,output:s.outputMd})),receipts:receipts.map(({stepId,attempt,startedMs,finishedMs,status,errorCode,outputSha256})=>({stepId,attempt,startedAt:iso(startedMs),finishedAt:iso(finishedMs),status,errorCode,outputSha256}))};
 const body=format==="json"?JSON.stringify(data,null,2)+"\n":[format==="md"?"# Dreamer mission report":"Dreamer mission report",data.notice,"Mission: "+data.missionId,"Completed: "+(data.finishedAt??"Unknown"),"Objective:\n"+data.objective,...data.steps.map(s=>(format==="md"?"## ":"")+s.agent+" ("+s.state+")\n\n"+(s.output??"No saved report.")),"Execution receipts:\n"+data.receipts.map(r=>r.stepId+" attempt "+r.attempt+" · "+r.status+" · "+(r.finishedAt??"Unfinished")+(r.outputSha256?" · SHA-256 "+r.outputSha256:"")).join("\n")].join("\n\n")+"\n";
 if(Buffer.byteLength(body,"utf8")>MAX_BYTES)throw Error("Report exceeds download limit");
 return {filename:"dreamer-"+job.id+"."+format,contentType:format==="json"?"application/json; charset=utf-8":"text/plain; charset=utf-8",body};
}
export function missionArtifact(db:DatabaseSync,id:string,format:ReportFormat){
 const job=getJob(db,id);if(!job)return null;
 return renderReport(job,attemptReceipts(db,id),format);
}
export function artifactResponse(a:Artifact){return new Response(a.body,{headers:{"Content-Type":a.contentType,"Content-Disposition":"attachment; filename=\""+a.filename+"\"","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'","Referrer-Policy":"no-referrer"}});}
