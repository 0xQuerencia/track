"use client";
import {useState,type FormEvent} from "react";
import Link from "next/link";
import {Panel} from "@/components/track/page";
import type {studioSnapshot,StudioCommand} from "@/lib/dreamer/studio-commands";
import type {CustomAgentInput,PodInput} from "@/lib/dreamer/studio";
type Snapshot=ReturnType<typeof studioSnapshot>;
const emptyAgent:CustomAgentInput={name:"",responsibility:"",effort:"low",maxTokens:1600,enabled:false};
const emptyPod:PodInput={name:"",description:"",agentKeys:[],tokenBudget:24000,enabled:false};
export function Studio({initial}:{initial:Snapshot}){
 const [data,setData]=useState(initial),[agent,setAgent]=useState<CustomAgentInput>(emptyAgent),[pod,setPod]=useState<PodInput>(emptyPod);
 const [editAgent,setEditAgent]=useState<{id:string;revision:number}|null>(null),[editPod,setEditPod]=useState<{id:string;revision:number}|null>(null);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 async function save(c:StudioCommand){
  setBusy(true);setNotice("");
  try{
   const r=await fetch("/api/dreamer/studio",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(c),cache:"no-store"});
   const result=await r.json();
   if(!r.ok||!result.ok)throw Error(result.error||"Save failed");
   setData(result);setNotice("Configuration saved. No mission was started.");return true;
  }catch(e){setNotice(e instanceof Error?e.message:"Save failed");return false;}finally{setBusy(false);}
 }
 async function submitAgent(e:FormEvent){e.preventDefault();if(await save(editAgent?{command:"edit-agent",...editAgent,input:agent}:{command:"create-agent",input:agent})){setEditAgent(null);setAgent(emptyAgent);}}
 async function submitPod(e:FormEvent){e.preventDefault();if(await save(editPod?{command:"edit-pod",...editPod,input:pod}:{command:"create-pod",input:pod})){setEditPod(null);setPod(emptyPod);}}
 return <div className="dm-layout">
 <Panel title="Specialist roster" description="The shared provider model remains pinned by the server. Custom agents start disabled unless you choose otherwise.">
 <div className="dm-status-grid">{data.agents.map(a=><div key={a.key}><small>{a.custom?"CUSTOM":"BUILT-IN"} · {a.enabled?"Enabled":"Disabled"}</small><strong>{a.name}</strong><span>{a.role} · {a.maxTokens} output tokens</span>{a.custom?<button type="button" className="tk-button" disabled={busy} onClick={()=>{setEditAgent({id:a.key,revision:a.revision});setAgent({name:a.name,responsibility:a.responsibility??"",effort:a.effort,maxTokens:a.maxTokens,enabled:a.enabled});}}>Edit specialist</button>:null}</div>)}</div>
 </Panel>
 <Panel title={editAgent?"Edit specialist":"Create a specialist"}><form className="dm-form" onSubmit={submitAgent}>
 <label>Name<input required minLength={2} maxLength={60} value={agent.name} onChange={e=>setAgent({...agent,name:e.target.value})}/></label>
 <label>Responsibility<textarea required minLength={3} maxLength={1200} value={agent.responsibility} onChange={e=>setAgent({...agent,responsibility:e.target.value})} placeholder="Review supplied study notes and propose targeted practice. Never include secrets."/></label>
 <label>Reasoning effort<select value={agent.effort} onChange={e=>setAgent({...agent,effort:e.target.value as CustomAgentInput["effort"]})}><option value="minimal">Minimal</option><option value="low">Low</option><option value="medium">Medium</option></select></label>
 <label>Output-token cap<input type="number" required min={256} max={4000} value={agent.maxTokens} onChange={e=>setAgent({...agent,maxTokens:Number(e.target.value)})}/></label>
 <label className="dm-check"><input type="checkbox" checked={agent.enabled} onChange={e=>setAgent({...agent,enabled:e.target.checked})}/> Enable for explicitly submitted Pod missions</label>
 <div className="dreamer-actions"><button className="tk-button" disabled={busy}>Save specialist</button>{editAgent?<button className="tk-button tk-ghost" type="button" onClick={()=>{setEditAgent(null);setAgent(emptyAgent);}}>Cancel edit</button>:null}</div></form></Panel>
 <Panel title="AI Pods" description="Private teams. Chief always synthesizes; Critic reviews other specialists when selected.">
 <div className="dm-status-grid">{data.pods.map(p=><div key={p.id}><small>{p.enabled?"Enabled":"Disabled"}</small><strong>{p.name}</strong><span>{p.description}</span><span>{p.agentKeys.map(k=>data.agents.find(a=>a.key===k)?.name??k).join(", ")}</span><span>{p.tokenBudget} reserved output-token budget</span><button className="tk-button" type="button" disabled={busy} onClick={()=>{setEditPod({id:p.id,revision:p.revision});setPod({name:p.name,description:p.description,agentKeys:p.agentKeys,tokenBudget:p.tokenBudget,enabled:p.enabled});}}>Edit Pod</button>{p.enabled?<Link className="tk-button tk-ghost" href={"/dreamer/missions?pod="+encodeURIComponent(p.id)}>Open Mission Control</Link>:null}</div>)}</div>
 {!data.pods.length?<p>No custom teams yet. Create your first Pod below.</p>:null}</Panel>
 <Panel title={editPod?"Edit Pod":"Create an AI Pod"}><form className="dm-form" onSubmit={submitPod}>
 <label>Name<input required minLength={2} maxLength={60} value={pod.name} onChange={e=>setPod({...pod,name:e.target.value})}/></label>
 <label>Description<textarea maxLength={600} rows={3} value={pod.description} onChange={e=>setPod({...pod,description:e.target.value})}/></label>
 <fieldset><legend>Specialists (1–6)</legend>{data.agents.filter(a=>a.key!=="chief").map(a=><label className="dm-check" key={a.key}><input type="checkbox" checked={pod.agentKeys.includes(a.key)} disabled={(!a.enabled||pod.agentKeys.length>=6)&&!pod.agentKeys.includes(a.key)} onChange={e=>setPod({...pod,agentKeys:e.target.checked?[...pod.agentKeys,a.key]:pod.agentKeys.filter(k=>k!==a.key)})}/>{a.name}{a.enabled?"":" · disabled"}</label>)}</fieldset>
 <label>Mission output-token reservation cap (not a monetary quota)<input required type="number" min={8000} max={100000} value={pod.tokenBudget} onChange={e=>setPod({...pod,tokenBudget:Number(e.target.value)})}/></label>
 <label className="dm-check"><input type="checkbox" checked={pod.enabled} onChange={e=>setPod({...pod,enabled:e.target.checked})}/> Enable Pod</label>
 <div className="dreamer-actions"><button className="tk-button" disabled={busy||!pod.agentKeys.length}>Save Pod</button>{editPod?<button className="tk-button tk-ghost" type="button" onClick={()=>{setEditPod(null);setPod(emptyPod);}}>Cancel edit</button>:null}</div></form></Panel>
 <p role="status">{notice}</p><Link href="/dreamer/missions">Go to Mission Control</Link></div>;
}
