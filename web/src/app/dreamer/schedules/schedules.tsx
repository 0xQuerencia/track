"use client";
import {useState,useEffect,type FormEvent} from "react";
import Link from "next/link";
import {Panel} from "@/components/track/page";
import type {ScheduleInput} from "@/lib/dreamer/schedule-clock";
import type {ScheduleCommand,scheduleSnapshot} from "@/lib/dreamer/schedule-commands";
type Snapshot=ReturnType<typeof scheduleSnapshot>;
const initialForm:ScheduleInput={name:"",objective:"",podId:null,timezone:"UTC",localTime:"08:00",weekday:null,enabled:false};
const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
export function Schedules({initial,pods}:{initial:Snapshot;pods:{id:string;name:string;enabled:boolean}[]}){
 const [snapshot,setSnapshot]=useState(initial),[input,setInput]=useState(initialForm),[edit,setEdit]=useState<{id:string;revision:number}|null>(null);
 const [pending,setPending]=useState(false),[notice,setNotice]=useState("");
 useEffect(()=>{const timer=setInterval(async()=>{try{const r=await fetch("/api/dreamer/schedules",{cache:"no-store"});const data=await r.json();if(r.ok&&data.ok)setSnapshot(data);}catch{}},8000);return()=>clearInterval(timer);},[]);
 async function save(c:ScheduleCommand){
  setPending(true);setNotice("");
  try{const r=await fetch("/api/dreamer/schedules",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(c)});const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||"Save failed");setSnapshot(data);setNotice("Saved. Check the worker and run receipts to confirm execution.");return true;}
  catch(e){setNotice(e instanceof Error?e.message:"Save failed");return false;}finally{setPending(false);}
 }
 async function submit(e:FormEvent){e.preventDefault();if(input.enabled&&!confirm("Approve repeated provider requests for this exact objective and cadence? Output-token budgets are not a spending guarantee."))return;if(await save(edit?{command:"edit",...edit,input}:{command:"create",input})){setEdit(null);setInput(initialForm);}}
 return <div className="dm-layout">
 <Panel title="Scheduler configuration">{snapshot.schedulerConfigured?<p>The scheduler flag is configured on this web process. Check <Link href="/dreamer/missions">worker health</Link> and receipts to verify that the separate worker is running with the same flag.</p>:<p className="dreamer-notice">Scheduler is off by default. A separately enabled worker with TRACK_DREAMER_SCHEDULER_ENABLED=1 is required.</p>}</Panel>
 <Panel title="Your schedules">{snapshot.schedules.length===0?<p>No recurring objectives configured.</p>:<ul className="dm-steps">{snapshot.schedules.map(s=><li key={s.id}><div className="dm-heading"><strong>{s.name}</strong><span>{s.enabled?"Enabled":"Disabled"}</span></div><p>{s.objective}</p><small>{s.weekday===null?"Daily":days[s.weekday]} · {s.localTime} · {s.timezone}</small><div className="dreamer-actions"><button className="tk-button" disabled={pending} onClick={()=>{setEdit({id:s.id,revision:s.revision});setInput({name:s.name,objective:s.objective,podId:s.podId,timezone:s.timezone,localTime:s.localTime,weekday:s.weekday,enabled:s.enabled});}}>Edit / pause</button><button className="tk-button tk-danger" disabled={pending} onClick={()=>{if(confirm("Delete this schedule and its run history? Existing reports remain separately deletable."))void save({command:"delete",id:s.id,revision:s.revision,confirm:true});}}>Delete</button></div></li>)}</ul>}</Panel>
 <Panel title={edit?"Edit recurring mission":"New recurring mission"}><form className="dm-form" onSubmit={submit}>
 <label>Name<input required minLength={2} maxLength={80} value={input.name} onChange={e=>setInput({...input,name:e.target.value})}/></label>
 <label>Fixed objective<textarea required minLength={3} maxLength={2200} value={input.objective} onChange={e=>setInput({...input,objective:e.target.value})}/></label>
 <label>Private team<select value={input.podId??""} onChange={e=>setInput({...input,podId:e.target.value||null})}><option value="">Chief selects specialists</option>{pods.filter(p=>p.enabled||p.id===input.podId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <label>Timezone<input required maxLength={80} value={input.timezone} onChange={e=>setInput({...input,timezone:e.target.value})}/></label><button className="tk-button tk-ghost" type="button" onClick={()=>setInput({...input,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})}>Use this device timezone</button>
 <label>Local time<input type="time" required value={input.localTime} onChange={e=>setInput({...input,localTime:e.target.value})}/></label>
 <label>Cadence<select value={input.weekday??""} onChange={e=>setInput({...input,weekday:e.target.value===""?null:Number(e.target.value)})}><option value="">Daily</option>{days.map((d,i)=><option key={d} value={i}>Every {d}</option>)}</select></label>
 <label className="dm-check"><input type="checkbox" checked={input.enabled} onChange={e=>setInput({...input,enabled:e.target.checked})}/> Explicitly approve this recurring read-only objective</label>
 <div className="dreamer-actions"><button className="tk-button" disabled={pending}>Save schedule</button>{edit?<button type="button" className="tk-button tk-ghost" onClick={()=>{setEdit(null);setInput(initialForm);}}>Cancel edit</button>:null}</div></form><p role="status">{notice}</p></Panel>
 <Panel title="Run receipts" description="Queued means a mission was created, not that it finished. Missed windows beyond five minutes are not replayed."><ul className="dm-receipts">{snapshot.receipts.map(r=><li key={String(r.schedule_id)+":"+String(r.local_day)}>{String(r.local_day)} · {String(r.state).replaceAll("_"," ")} · {snapshot.schedules.find(s=>s.id===r.schedule_id)?.name??"Schedule"} {r.job_id?<Link href={"/dreamer/missions?job="+encodeURIComponent(String(r.job_id))}>Inspect mission</Link>:null}</li>)}</ul>{!snapshot.receipts.length?<p>No run receipts.</p>:null}</Panel>
 </div>;
}
