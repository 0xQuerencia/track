"use client";
import {useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import {Panel} from "@/components/track/page";
import type {MemoryNote,MemoryInput} from "@/lib/dreamer/memory";
import type {MemoryCommand} from "@/lib/dreamer/memory-commands";
export function MemoryWorkspace({pods,initialNamespace,sourceJobId}:{pods:{id:string;name:string}[];initialNamespace:string;sourceJobId:string}){
 const [namespace,setNamespace]=useState(initialNamespace),[notes,setNotes]=useState<MemoryNote[]>([]),[title,setTitle]=useState(""),[body,setBody]=useState(""),[source,setSource]=useState(sourceJobId),[expiry,setExpiry]=useState(""),[edit,setEdit]=useState<{id:string;revision:number}|null>(null),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const [revision,setRevision]=useState(0);
 useEffect(()=>{let stop=false;fetch("/api/dreamer/memory?namespace="+encodeURIComponent(namespace),{cache:"no-store"}).then(async r=>{const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||"Memory unavailable");if(!stop)setNotes(data.notes);}).catch(e=>{if(!stop){setNotes([]);setNotice(e.message);}});return()=>{stop=true;};},[namespace,revision]);
 function reset(){setTitle("");setBody("");setSource("");setExpiry("");setEdit(null);}
 async function save(c:MemoryCommand){
  setBusy(true);setNotice("");
  try{const r=await fetch("/api/dreamer/memory",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(c)});const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||"Memory request failed");setNotes(data.notes);setRevision(v=>v+1);setNotice("Memory updated locally. No model request was sent.");return true;}
  catch(e){setNotice(e instanceof Error?e.message:"Memory request failed");return false;}finally{setBusy(false);}
 }
 async function submit(e:FormEvent){
  e.preventDefault();
  const expiresMs=expiry?new Date(expiry+"T23:59:59").getTime():null;
  const input:MemoryInput={namespace,title,body,sourceJobId:source.trim()||null,expiresMs};
  if(await save(edit?{command:"edit",...edit,input}:{command:"create",input}))reset();
 }
 return <div className="dm-layout"><Panel title="Memory namespace"><label>Private scope<select value={namespace} disabled={busy} onChange={e=>{setNamespace(e.target.value);setNotes([]);reset();}}><option value="personal">Personal only</option>{pods.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><p>Only missions in this namespace may explicitly attach these notes.</p></Panel>
 <Panel title={edit?"Edit memory":"Add memory"}><form className="dm-form" onSubmit={submit}><label>Title<input required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Memory note<textarea required maxLength={3000} rows={5} value={body} onChange={e=>setBody(e.target.value)}/></label><label>Completed mission ID (optional evidence)<input maxLength={80} value={source} onChange={e=>setSource(e.target.value)}/></label><label>Expiry date (optional)<input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label><div className="dreamer-actions"><button className="tk-button" disabled={busy}>Save memory</button>{edit?<button type="button" className="tk-button tk-ghost" onClick={reset}>Cancel edit</button>:null}</div></form><p role="status">{notice}</p></Panel>
 <Panel title="Saved notes">{notes.length?<ul className="dm-steps">{notes.map(n=><li key={n.id}><strong>{n.title}</strong><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{n.body}</p><small>{n.expiresMs?"Expires "+new Date(n.expiresMs).toLocaleDateString():"No expiry"}</small>{n.sourceJobId?<p><Link href={"/dreamer/missions?job="+encodeURIComponent(n.sourceJobId)}>Source mission</Link></p>:null}<div className="dreamer-actions"><button className="tk-button" disabled={busy} onClick={()=>{setEdit({id:n.id,revision:n.revision});setTitle(n.title);setBody(n.body);setSource(n.sourceJobId??"");setExpiry(n.expiresMs?new Date(n.expiresMs).toLocaleDateString("sv-SE"):"");}}>Edit</button><button className="tk-button tk-danger" disabled={busy} onClick={()=>{if(confirm("Delete this memory? Queued missions using it will stop."))void save({command:"delete",id:n.id,revision:n.revision,namespace,confirm:true});}}>Delete</button></div></li>)}</ul>:<p>No current memories in this namespace.</p>}</Panel><Link href={"/dreamer/missions"+(namespace==="personal"?"":"?pod="+encodeURIComponent(namespace))}>Use selected memories in a mission</Link></div>;
}
