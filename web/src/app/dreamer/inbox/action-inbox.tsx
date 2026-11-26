"use client";
import {useEffect,useState,useRef} from "react";
import Link from "next/link";
import {Panel} from "@/components/track/page";
import type {ActionDraft} from "@/lib/dreamer/action-approvals";
import type {actionPreview} from "@/lib/dreamer/action-drafting";
type Preview=ReturnType<typeof actionPreview>;
const endpoint="/api/dreamer/actions";
async function api<T>(query="",data?:unknown):Promise<T>{
 const r=await fetch(endpoint+query,{cache:"no-store",...(data?{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)}:{})});
 const body=await r.json();if(!r.ok||!body.ok)throw Error(body.error||"Request failed");return body as T;
}
export function ActionInbox({initialJob}:{initialJob:string}){
 const [drafts,setDrafts]=useState<ActionDraft[]>([]),[preview,setPreview]=useState<Preview|null>(null),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
 const [job,setJob]=useState(initialJob),[selected,setSelected]=useState(initialJob),[revision,setRevision]=useState(0);
 const requestId=useRef<{job:string;hash:string;id:string}|null>(null);
 useEffect(()=>{
  let stop=false;
  const q=selected?"?job="+encodeURIComponent(selected):"";
  api<{drafts:ActionDraft[];preview?:Preview}>(q).then(r=>{if(!stop){setDrafts(r.drafts);setPreview(r.preview??null);setLoaded(true);setNotice("");}}).catch(e=>{if(!stop){setLoaded(true);setNotice(e.message);setDrafts([]);setPreview(null);}});
  return()=>{stop=true;};
 },[selected,revision]);
 async function draft(){
  if(!preview||!confirm("Send only the redacted objective and report shown above to the configured AI provider to generate up to three local record proposals?"))return;
  if(requestId.current?.job!==preview.jobId||requestId.current.hash!==preview.sha256)requestId.current={job:preview.jobId,hash:preview.sha256,id:crypto.randomUUID()};
  setBusy(true);setNotice("");
  try{const r=await api<{drafts:ActionDraft[]}>("",{command:"draft",jobId:preview.jobId,reportSha256:preview.sha256,requestId:requestId.current.id});setDrafts(r.drafts);requestId.current=null;setNotice(r.drafts.length?"Proposals ready for individual review.":"No suitable proposals were returned.");}
  catch(e){setNotice(e instanceof Error?e.message:"Drafting failed");}finally{setBusy(false);}
 }
 async function handle(a:ActionDraft,command:"approve"|"reject"){
  if(command==="approve"&&!confirm("Create exactly this local record in Track? This approval cannot authorize other actions."))return;
  setBusy(true);setNotice("");
  try{const r=await api<{draft:ActionDraft}>("",{command,id:a.id,approvalSha256:a.approvalSha256});setDrafts(old=>old.map(d=>d.id===r.draft.id?r.draft:d));setNotice(r.draft.state==="applied"?"Record created. See the receipt below.":"Draft "+r.draft.state+".");}
  catch(e){setNotice(e instanceof Error?e.message:"Action failed");}finally{setBusy(false);}
 }
 return <div className="dm-layout">
 <Panel title="Mission source"><form className="dm-form" onSubmit={e=>{e.preventDefault();setLoaded(false);setPreview(null);setSelected(job.trim());setRevision(x=>x+1);}}><label>Completed mission ID (optional)<input maxLength={80} value={job} onChange={e=>setJob(e.target.value)} placeholder="Leave empty for all drafts"/></label><button className="tk-button" disabled={busy}>Load</button></form>
 {preview?<div className="dm-disclosure"><strong>Exact redacted model payload</strong><p>{preview.objective}</p><details><summary>Report excerpt</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{preview.report}</pre></details><button className="tk-button" type="button" disabled={busy} onClick={()=>void draft()}>Generate action proposals</button></div>:<p>Open a completed mission in <Link href="/dreamer/missions">Mission Control</Link> to select its report.</p>}</Panel>
 <Panel title="Action proposals" description="Only local task, calendar event and note creation is supported. No email, invitation, external write or deletion.">
 {!loaded?<p>Loading…</p>:drafts.length===0?<p>No action proposals.</p>:<ol className="dm-steps">{drafts.map(a=><li key={a.id}><div className="dm-heading"><strong>{a.input.tool.replace("track.","").replaceAll("_"," ")}</strong><span className="dm-state">{a.state}</span></div><dl>{Object.entries(a.input.params).map(([key,value])=><div key={key}><dt><strong>{key.replaceAll("_"," ")}</strong></dt><dd style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",margin:"0 0 .5rem"}}>{String(value)}</dd></div>)}</dl><small>Expires {new Date(a.expiresMs).toLocaleString()}</small><p><Link href={"/dreamer/missions?job="+encodeURIComponent(a.jobId)}>Source mission</Link></p>{a.state==="pending"?<div className="dreamer-actions"><button className="tk-button" disabled={busy} onClick={()=>void handle(a,"approve")}>Approve exact action</button><button className="tk-button tk-ghost" disabled={busy} onClick={()=>void handle(a,"reject")}>Reject</button></div>:null}{a.receipt?<div><strong>{a.receipt.summary}</strong>{a.receipt.href?.startsWith("/")&&!a.receipt.href.startsWith("//")?<p><Link href={a.receipt.href}>Open created record</Link></p>:null}</div>:null}</li>)}</ol>}
 </Panel><p role="status">{notice}</p></div>;
}
