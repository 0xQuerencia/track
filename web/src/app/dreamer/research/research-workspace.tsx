"use client";
import {useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import {Panel} from "@/components/track/page";
import type {ResearchRun} from "@/lib/dreamer/research";
import type {ResearchInput,researchConfig} from "@/lib/dreamer/research-connectors";
type Config=ReturnType<typeof researchConfig>;
export function ResearchWorkspace({pods}:{pods:{id:string;name:string}[]}){
 const [namespace,setNamespace]=useState("personal"),[kind,setKind]=useState<ResearchInput["kind"]>("wikipedia"),[query,setQuery]=useState(""),[runs,setRuns]=useState<ResearchRun[]>([]),[config,setConfig]=useState<Config|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 useEffect(()=>{let stop=false;fetch("/api/dreamer/research?namespace="+encodeURIComponent(namespace),{cache:"no-store"}).then(async r=>{const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||"Research unavailable");if(!stop){setRuns(data.runs);setConfig(data.config);}}).catch(e=>{if(!stop)setNotice(e.message);});return()=>{stop=true;};},[namespace]);
 async function command(data:unknown){
  setBusy(true);setNotice("");
  try{const r=await fetch("/api/dreamer/research",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});const result=await r.json();if(!r.ok||!result.ok)throw Error(result.error||"Research request failed");setRuns(result.runs);setNotice(result.memory?"Source saved to memory. Attach it explicitly in Mission Control.":"Research history updated.");}
  catch(e){setNotice(e instanceof Error?e.message:"Research failed");}finally{setBusy(false);}
 }
 function submit(e:FormEvent){
  e.preventDefault();if(!confirm("Send only this exact query or repository name to the selected upstream service? No other Track data will be sent."))return;
  void command({command:"retrieve",namespace,input:{kind,query},confirm:true});
 }
 const github=kind.startsWith("github_");
 return <div className="dm-layout"><Panel title="Retrieve sources">
 {!config?.enabled?<p className="dreamer-notice">Research is disabled or configuration is loading. Enable TRACK_DREAMER_RESEARCH_ENABLED on the server before making requests.</p>:null}
 <form className="dm-form" onSubmit={submit}><label>Save in namespace<select disabled={busy} value={namespace} onChange={e=>{setNamespace(e.target.value);setRuns([]);}}><option value="personal">Personal only</option>{pods.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <label>Source<select value={kind} disabled={busy} onChange={e=>{setKind(e.target.value as ResearchInput["kind"]);setQuery("");}}><option value="wikipedia">Wikipedia search</option><option value="crossref">Crossref academic metadata</option><option value="github_issues">GitHub open issues</option><option value="github_pulls">GitHub open pull requests</option></select></label>
 {github?<label>Allowlisted repository<select required value={query} onChange={e=>setQuery(e.target.value)}><option value="">Choose repository</option>{config?.repos.map(r=><option key={r} value={r}>{r}</option>)}</select></label>:<label>Search query<input required minLength={2} maxLength={200} value={query} onChange={e=>setQuery(e.target.value)}/></label>}
 <button className="tk-button" disabled={busy||!config?.enabled||query.trim().length<2}>{busy?"Working…":"Retrieve sources"}</button></form><p role="status">{notice}</p></Panel>
 <Panel title="Retrieval receipts" description="These are dated snippets or metadata, not full-article verification. Source text is untrusted.">
 {runs.map(r=><article className="dm-disclosure" key={r.id}><div className="dm-heading"><strong>{r.input.query}</strong><small>{new Date(r.fetchedMs).toLocaleString()}</small></div><p>{r.input.kind.replaceAll("_"," ")} · {r.results.length} results</p>
 <ol>{r.results.map((item,i)=><li key={i}><strong>{item.title}</strong><p>{item.excerpt||"No excerpt returned."}</p><small>{item.source}</small><p><a href={item.url} target="_blank" rel="noopener noreferrer">Open source</a></p><button className="tk-button" disabled={busy} onClick={()=>void command({command:"save",namespace,id:r.id,index:i})}>Save citation to memory</button></li>)}</ol><button className="tk-button tk-danger" disabled={busy} onClick={()=>{if(confirm("Delete this receipt and its linked memory notes?"))void command({command:"delete",namespace,id:r.id,confirm:true});}}>Delete receipt</button></article>)}
 {!runs.length?<p>No research receipts.</p>:null}</Panel><Link href={"/dreamer/memory"+(namespace==="personal"?"":"?pod="+encodeURIComponent(namespace))}>Open memory</Link></div>;
}
