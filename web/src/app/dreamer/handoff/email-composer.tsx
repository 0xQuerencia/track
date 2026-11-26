"use client";
import {useState,type FormEvent} from "react";
export function EmailComposer({report}:{report:string}){
 const [to,setTo]=useState(""),[subject,setSubject]=useState(""),[body,setBody]=useState(""),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 async function download(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setNotice("");
 try{const response=await fetch("/api/dreamer/handoff",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({to,subject,body})});
 if(!response.ok){const v=await response.json();throw Error(v.error??"Draft unavailable");}
 const url=URL.createObjectURL(await response.blob()),a=document.createElement("a");a.href=url;a.download="dreamer-unsent.eml";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice("Unsent draft prepared. Review it again in your mail client before sending.");}
 catch(e){setNotice(e instanceof Error?e.message:"Draft unavailable");}finally{setBusy(false);}}
 return <form className="tk-stack" onSubmit={download}><label>To <input type="email" required maxLength={254} value={to} onChange={e=>setTo(e.target.value)}/></label><label>Subject <input required maxLength={180} value={subject} onChange={e=>setSubject(e.target.value)}/></label>
 {report?<button className="tk-button tk-ghost" type="button" onClick={()=>{if(!body||confirm("Replace your draft body with the saved Chief report?"))setBody(report);}}>Insert saved Chief report</button>:null}
 <label>Message <textarea required maxLength={12000} rows={12} value={body} onChange={e=>setBody(e.target.value)}/></label><p>Check the recipient and remove private context before opening this file in an external mail client.</p><button className="tk-button" disabled={busy}>{busy?"Preparing…":"Download unsent .eml"}</button><p role="status">{notice}</p></form>;
}
