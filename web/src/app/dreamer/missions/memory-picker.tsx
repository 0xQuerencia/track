"use client";
import {useEffect,useState} from "react";
import type {MemoryNote,MemorySelection,memoryPreview} from "@/lib/dreamer/memory";
type Preview=ReturnType<typeof memoryPreview>;
export function MemoryPicker({namespace,disabled,onApprove}:{namespace:string;disabled:boolean;onApprove:(value:MemorySelection|null)=>void}){
 const [notes,setNotes]=useState<MemoryNote[]>([]),[ids,setIds]=useState<string[]>([]),[preview,setPreview]=useState<Preview|null>(null),[approved,setApproved]=useState(false),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{let stop=false;fetch("/api/dreamer/memory?namespace="+encodeURIComponent(namespace),{cache:"no-store"}).then(async r=>{const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||"Memory unavailable");if(!stop)setNotes(data.notes);}).catch(e=>{if(!stop)setNotice(e.message);});return()=>{stop=true;};},[namespace]);
 function change(id:string,on:boolean){setIds(old=>on?[...old,id]:old.filter(x=>x!==id));setPreview(null);setApproved(false);onApprove(null);}
 async function review(){
  setBusy(true);setNotice("");setPreview(null);setApproved(false);onApprove(null);
  try{const r=await fetch("/api/dreamer/memory",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({command:"preview",namespace,ids})});const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||"Preview failed");setPreview(data.preview);}
  catch(e){setNotice(e instanceof Error?e.message:"Preview failed");}finally{setBusy(false);}
 }
 return <fieldset className="dm-disclosure"><legend>Optional memory notes ({namespace==="personal"?"personal":"selected Pod"})</legend>
 <p>Choose up to six notes, preview their redacted text and explicitly include it. Other namespaces are not available.</p>
 {notes.map(n=><label className="dm-check" key={n.id}><input type="checkbox" checked={ids.includes(n.id)} disabled={disabled||busy||ids.length>=6&&!ids.includes(n.id)} onChange={e=>change(n.id,e.target.checked)}/>{n.title}</label>)}
 {!notes.length?<p>No current notes.</p>:null}
 <button type="button" className="tk-button tk-ghost" disabled={disabled||busy||ids.length===0} onClick={()=>void review()}>Preview selected notes</button>
 {preview?<><ol>{preview.items.map(i=><li key={i.id}><strong>{i.label}</strong><p>{i.text}</p></li>)}</ol><label className="dm-check"><input type="checkbox" checked={approved} disabled={disabled||busy} onChange={e=>{setApproved(e.target.checked);onApprove(e.target.checked?{ids,sha256:preview.sha256}:null);}}/>Include exactly these excerpts in this mission</label></>:null}<p role="status">{notice}</p>
 </fieldset>;
}
