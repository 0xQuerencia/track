"use client";
import {useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import {Panel} from "@/components/track/page";
import type {Watch,WatchInput,WatchEvent} from "@/lib/dreamer/sentinel";
type Snapshot={watches:Watch[];events:WatchEvent[];config:{enabled:boolean;sentinelConfigured:boolean;repos:string[];githubAuthenticated:boolean}};
const initial:WatchInput={name:"",repo:"",kind:"github_issues",intervalMinutes:60,enabled:false};
const time=(ms:number|null)=>ms===null?"Never":new Date(ms).toLocaleString();
export function SentinelWorkspace(){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[input,setInput]=useState<WatchInput>(initial),[edit,setEdit]=useState<{id:string;revision:number}|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 useEffect(()=>{
  let stop=false,loading=false;
  async function refresh(){if(stop||loading)return;loading=true;try{const r=await fetch("/api/dreamer/sentinel",{cache:"no-store"}),v=await r.json();if(r.ok&&v.ok&&!stop)setSnapshot(v);}catch{if(!stop)setNotice("Watch connection unavailable.");}finally{loading=false;}}
  void refresh();const t=setInterval(()=>void refresh(),10000);return()=>{stop=true;clearInterval(t);};
 },[]);
 async function save(body:unknown){
  setBusy(true);setNotice("");
  try{const r=await fetch("/api/dreamer/sentinel",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),v=await r.json();if(!r.ok||!v.ok)throw Error(v.error||"Watch request failed");setSnapshot(v);setNotice("Saved. Only actual worker receipts establish that monitoring ran.");return true;}
  catch(e){setNotice(e instanceof Error?e.message:"Watch request failed");return false;}finally{setBusy(false);}
 }
 async function submit(e:FormEvent){e.preventDefault();if(input.enabled&&!confirm("Approve repeated read-only checks of this exact repository and kind at the selected interval?"))return;if(await save(edit?{command:"edit",...edit,input}:{command:"create",input})){setEdit(null);setInput(initial);}}
 return <div className="dm-layout"><Panel title="Monitoring status">
 {!snapshot?.config.enabled||!snapshot.config.sentinelConfigured?<p className="dreamer-notice">Sentinel or research is disabled on this web process. Configure both server flags and the separate worker before enabling a watch.</p>:<p>Configured for allowlisted repositories. Check <Link href="/dreamer/missions">worker health</Link> and last successful reads. {snapshot.config.githubAuthenticated?"A dedicated GitHub credential is configured.":"Anonymous GitHub reads only."}</p>}
 <p>Checks sample at most ten currently open issues or pull requests. Changes outside that sample may not be detected. No external messages are sent.</p></Panel>
 <Panel title="Your watches">{snapshot?.watches.map(w=><article key={w.id} className="dm-disclosure"><div className="dm-heading"><strong>{w.name}</strong><span>{w.running?"Checking":w.enabled?"Enabled":"Disabled"}</span></div><p>{w.repo} · {w.kind.replaceAll("_"," ")} · every {w.intervalMinutes} minutes</p><small>Last success: {time(w.lastSuccessMs)} · Next eligible: {time(w.nextDueMs)}</small>{w.lastError?<p role="status">{w.lastError.replaceAll("_"," ")}</p>:null}<div className="dreamer-actions"><button className="tk-button" disabled={busy} onClick={()=>{setEdit({id:w.id,revision:w.revision});setInput({name:w.name,repo:w.repo,kind:w.kind,intervalMinutes:w.intervalMinutes,enabled:w.enabled});}}>Edit / pause</button><button className="tk-button tk-danger" disabled={busy} onClick={()=>{if(confirm("Delete watch and local change history?"))void save({command:"delete",id:w.id,revision:w.revision,confirm:true});}}>Delete</button></div></article>)}{!snapshot?.watches.length?<p>No watches configured.</p>:null}</Panel>
 <Panel title={edit?"Edit watch":"Create watch"}><form className="dm-form" onSubmit={submit}><label>Name<input required minLength={2} maxLength={80} value={input.name} onChange={e=>setInput({...input,name:e.target.value})}/></label>
 <label>Repository<select value={input.repo} required onChange={e=>setInput({...input,repo:e.target.value})}><option value="">Choose allowlisted repository</option>{[...new Set([...(snapshot?.config.repos??[]),...(input.repo?[input.repo]:[])])].map(r=><option key={r} value={r}>{r}</option>)}</select></label>
 <label>Watch<select value={input.kind} onChange={e=>setInput({...input,kind:e.target.value as WatchInput["kind"]})}><option value="github_issues">Open issues</option><option value="github_pulls">Open pull requests</option></select></label>
 <label>Cadence<select value={input.intervalMinutes} onChange={e=>setInput({...input,intervalMinutes:Number(e.target.value) as WatchInput["intervalMinutes"]})}><option value={60}>Hourly</option><option value={360}>Every six hours</option><option value={1440}>Daily</option></select></label>
 <label className="dm-check"><input type="checkbox" checked={input.enabled} onChange={e=>setInput({...input,enabled:e.target.checked})}/> Explicitly enable this watch</label><div className="dreamer-actions"><button className="tk-button" disabled={busy}>Save watch</button>{edit?<button type="button" className="tk-button tk-ghost" onClick={()=>{setEdit(null);setInput(initial);}}>Cancel edit</button>:null}</div></form><p role="status">{notice}</p></Panel>
 <Panel title="Change inbox" description="Baseline and changed samples only, not a full repository event feed.">{snapshot?.events.map(ev=><article className="dm-disclosure" key={ev.id}><div className="dm-heading"><strong>{snapshot.watches.find(w=>w.id===ev.watchId)?.name??"Watch"} · {ev.kind}</strong><small>{ev.seenMs?"Read":"Unread"}</small></div><p>{time(ev.createdMs)}</p><details><summary>{ev.results.length} observed open items</summary><ol>{ev.results.map(item=><li key={item.url}><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a><p>{item.excerpt}</p></li>)}</ol></details>{!ev.seenMs?<button className="tk-button" disabled={busy} onClick={()=>void save({command:"seen",id:ev.id})}>Mark read</button>:null}</article>)}{!snapshot?.events.length?<p>No receipts yet.</p>:null}</Panel></div>;
}
