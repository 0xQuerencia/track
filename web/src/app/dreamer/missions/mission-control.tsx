"use client";
import {useEffect,useState,useRef,type FormEvent} from "react";
import {Panel} from "@/components/track/page";
import type {DurableJob,listJobs} from "@/lib/dreamer/jobs";
import type {attemptReceipts} from "@/lib/dreamer/job-leases";
import type {workerHealth} from "@/lib/dreamer/worker";
import type {currentMissionDisclosure} from "@/lib/dreamer/job-executor";
type Snapshot={jobs:ReturnType<typeof listJobs>;worker:ReturnType<typeof workerHealth>;policy:string|null};
type Detail={job:DurableJob;receipts:ReturnType<typeof attemptReceipts>};
type Disclosure=ReturnType<typeof currentMissionDisclosure>;
const url="/api/dreamer/missions";
async function api<T>(query="",init?:RequestInit):Promise<T>{
 const response=await fetch(url+query,{cache:"no-store",credentials:"same-origin",...init});
 const result=await response.json();
 if(!response.ok||result.ok!==true)throw new Error(typeof result.error==="string"?result.error:"Mission request failed");
 return result as T;
}
const time=(ms:number|null)=>ms===null?"—":new Date(ms).toLocaleString();
const active=(state:string)=>state==="queued"||state==="running";
function State({state}:{state:string}){return <span className="dm-state" data-state={state}>{state.replaceAll("_"," ")}</span>;}
export function MissionControl(){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [detail,setDetail]=useState<Detail|null>(null);
 const [selected,setSelected]=useState<string|null>(null);
 const [objective,setObjective]=useState("");
 const [context,setContext]=useState(false);
 const [preview,setPreview]=useState<Disclosure|null>(null);
 const [notice,setNotice]=useState("");
 const [connection,setConnection]=useState("");
 const [detailError,setDetailError]=useState("");
 const [busy,setBusy]=useState(false);
 const [refresh,setRefresh]=useState(0);
 const draft=useRef<{id:string;key:string}|null>(null);
 useEffect(()=>{
  let done=false,running=false;const controller=new AbortController();
  async function load(){
   if(running||done)return;running=true;
   try{const result=await api<Snapshot>("",{signal:controller.signal});if(!done){setSnapshot(result);setConnection("");}}
   catch{if(!done)setConnection("Queue connection interrupted. Showing the last received snapshot.");}
   finally{running=false;}
  }
  void load();const timer=setInterval(()=>void load(),4000);
  return()=>{done=true;controller.abort();clearInterval(timer);};
 },[refresh]);
 useEffect(()=>{
  if(!selected)return;
  let done=false,running=false;const controller=new AbortController();
  async function load(){
   if(running||done)return;running=true;
   try{const result=await api<Detail>("?id="+encodeURIComponent(selected!),{signal:controller.signal});if(!done){setDetail(result);setDetailError("");}}
   catch{if(!done){setDetail(null);setDetailError("Mission details are unavailable.");}}
   finally{running=false;}
  }
  void load();const timer=setInterval(()=>void load(),2500);
  return()=>{done=true;controller.abort();clearInterval(timer);};
 },[selected,refresh]);
 async function loadPreview(){
  setBusy(true);setNotice("");
  try{const result=await api<Snapshot&{disclosure:Disclosure}>("?preview=1");setPreview(result.disclosure);setContext(false);setNotice("Review the exact redacted excerpts below before opting in.");}
  catch(e){setNotice(e instanceof Error?e.message:"Preview unavailable");}
  finally{setBusy(false);}
 }
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;
  const value=objective.trim();if(value.length<3)return;
  const approvalSha256=context?preview?.sha256:undefined;
  if(context&&!approvalSha256){setNotice("Review the disclosure preview first.");return;}
  const key=JSON.stringify({value,context,approvalSha256});
  if(draft.current?.key!==key)draft.current={key,id:crypto.randomUUID()};
  const id=draft.current.id;setBusy(true);setNotice("");
  try{
   await api("",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({command:"enqueue",id,objective:value,includeContext:context,...(approvalSha256?{approvalSha256}:{})})});
   draft.current=null;setObjective("");setContext(false);setPreview(null);setSelected(id);setRefresh(v=>v+1);setNotice("Mission queued. An enabled worker must claim it before execution starts.");
  }catch(e){setNotice(e instanceof Error?e.message:"Could not queue mission");}
  finally{setBusy(false);}
 }
 async function cancel(id:string){
  if(!window.confirm("Cancel this mission? An already-sent provider request cannot be recalled."))return;
  setBusy(true);setNotice("");
  try{await api("",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({command:"cancel",id})});setRefresh(v=>v+1);setNotice("Cancellation recorded.");}
  catch(e){setNotice(e instanceof Error?e.message:"Could not cancel mission");}
  finally{setBusy(false);}
 }
 async function erase(id:string){
  if(!window.confirm("Permanently delete this mission, its reports and receipts from Track? This cannot recall provider requests."))return;
  setBusy(true);setNotice("");
  try{await api("",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({command:"delete",id,confirm:true})});setSelected(null);setDetail(null);setRefresh(v=>v+1);setNotice("Mission deleted from local storage.");}
  catch(e){setNotice(e instanceof Error?e.message:"Could not delete mission");}finally{setBusy(false);}
 }
 const current=detail?.job.id===selected?detail:null;
 return <div className="dm-layout">
 <Panel title="Worker &amp; consent"><div className="dm-status-grid"><div><small>Worker</small><strong>{!snapshot?"Loading":snapshot.worker.online===0?"Offline":snapshot.worker.working>0?"Working":snapshot.worker.paused>0?"Paused":"Online"}</strong><span>{snapshot?time(snapshot.worker.lastSeenMs):"—"}</span></div><div><small>AI policy</small><strong>{!snapshot?"Loading":snapshot.policy?snapshot.policy.replaceAll("_"," "):"Available"}</strong><span>Shared Dreamer consent and provider</span></div><div><small>Queue</small><strong>{snapshot?snapshot.jobs.filter(j=>active(j.state)).length:"—"}</strong><span>Active recent missions</span></div></div>
 {snapshot?.worker.online===0?<p className="dreamer-notice">No worker heartbeat received. Queued missions will remain pending until an explicitly enabled worker is running.</p>:null}
 {connection?<p className="dreamer-notice" role="status">{connection}</p>:null}</Panel>
 <Panel title="New mission" description="Only your typed objective is sent by default. Optional evidence requires a fresh preview and confirmation.">
 <form className="dm-form" onSubmit={submit}>
 <label>Objective<textarea value={objective} onChange={e=>setObjective(e.target.value)} minLength={3} maxLength={2200} required rows={5} placeholder="Review the architecture of my project and propose testable next steps." disabled={busy}/></label>
 <div className="dreamer-actions"><button type="button" className="tk-button tk-ghost" onClick={()=>void loadPreview()} disabled={busy}>Review optional context</button></div>
 {preview?<div className="dm-disclosure"><strong>{preview.items.length} approved-source excerpts</strong>{preview.items.length?<ol>{preview.items.map(i=><li key={i.id}><small>{i.label}</small><p>{i.text}</p></li>)}</ol>:<p>No current permitted evidence is available.</p>}<label className="dm-check"><input type="checkbox" checked={context} onChange={e=>setContext(e.target.checked)} disabled={busy||preview.items.length===0}/> Include exactly this preview; if it changes, stop the mission.</label></div>:null}
 <button className="tk-button" disabled={busy||!snapshot||!!snapshot.policy||objective.trim().length<3} type="submit">{busy?"Working…":"Queue mission"}</button>
 </form><p role="status" className="dm-notice">{notice}</p></Panel>
 <Panel title="Mission history" description="Select a mission to inspect dependencies, attempts and saved reports.">
 {!snapshot?<p>Loading queue…</p>:snapshot.jobs.length===0?<p className="tk-empty">No durable missions yet.</p>:<ul className="dm-jobs">{snapshot.jobs.map(j=><li key={j.id}><button type="button" aria-pressed={selected===j.id} onClick={()=>{setSelected(j.id);setDetailError("");}}><span>{j.objective}</span><State state={j.state}/><small>{time(j.createdMs)} · {j.attemptsReserved}/{j.attemptBudget} attempts reserved</small></button></li>)}</ul>}
 </Panel>
 {selected?<Panel title="Mission detail">{!current?<p role="status">{detailError||"Loading mission…"}</p>:<>
 <div className="dm-heading"><h3>{current.job.objective}</h3><State state={current.job.state}/></div>
 <p>{current.job.attemptsReserved}/{current.job.attemptBudget} attempts · {current.job.tokensReserved}/{current.job.tokenBudget} requested output tokens reserved (not actual billing)</p>
 {active(current.job.state)?<button className="tk-button tk-danger" disabled={busy} type="button" onClick={()=>void cancel(current.job.id)}>Cancel mission</button>:<button className="tk-button tk-danger" disabled={busy} type="button" onClick={()=>void erase(current.job.id)}>Delete mission</button>}
 <ol className="dm-steps">{current.job.steps.map(s=><li key={s.id}><div className="dm-heading"><strong>{s.agentKey}</strong><State state={s.state}/></div><small>{s.dependsOn.length?"After "+s.dependsOn.join(", "):"No dependencies"} · attempt {s.attempt}/{s.maxAttempts}{s.errorCode?" · "+s.errorCode.replaceAll("_"," "):""}</small>{s.outputMd?<details open={s.agentKey==="chief"}><summary>Saved analysis</summary><pre>{s.outputMd}</pre></details>:null}</li>)}</ol>
 <details><summary>Execution receipts ({current.receipts.length})</summary><ul className="dm-receipts">{current.receipts.map(r=><li key={r.stepId+":"+r.attempt}>{r.stepId} · attempt {r.attempt} · {r.status} · {time(r.startedMs)}{r.errorCode?" · "+r.errorCode:""}{r.outputSha256?<code>SHA-256: {r.outputSha256}</code>:null}</li>)}</ul></details>
 </>}</Panel>:null}
 </div>;
}
