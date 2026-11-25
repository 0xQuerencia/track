"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {DEFAULT_POMODORO,roomPhase,type PomodoroConfig} from "@/lib/lock-in/clock";
import type {Session} from "@/lib/lock-in/sessions";
import type {LockInCommand} from "@/lib/lock-in/commands";
type Snapshot={ok:true;serverNow:number;session:Session|null;recent:Session[];result?:Session};
const PRESETS=[{name:"25 / 5",config:DEFAULT_POMODORO},{name:"50 / 10",config:{focusMs:3000000,shortBreakMs:600000,longBreakMs:1200000,rounds:4,longBreakEvery:4}},{name:"90 / 15",config:{focusMs:5400000,shortBreakMs:900000,longBreakMs:1800000,rounds:2,longBreakEvery:2}}];
function display(ms:number){const s=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");}
export function LockInTimer(){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [now,setNow]=useState(0);
  const [offset,setOffset]=useState(0);
  const [label,setLabel]=useState("");
  const [config,setConfig]=useState<PomodoroConfig>(DEFAULT_POMODORO);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const busy=useRef(false),requestEpoch=useRef(0),startId=useRef<string|null>(null);
  const apply=useCallback((s:Snapshot,started:number)=>{
    const received=Date.now();setSnapshot(s);setOffset(s.serverNow-(started+received)/2);setNow(received);
  },[]);
  const refresh=useCallback(async()=>{
    if(busy.current)return;
    const epoch=++requestEpoch.current,t=Date.now();
    try{
      const response=await fetch("/api/lock-in",{cache:"no-store",signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error("Could not load session");
      const s=await response.json() as Snapshot;
      if(!s.ok||typeof s.serverNow!=="number")throw new Error("Invalid response");
      if(epoch===requestEpoch.current){apply(s,t);setError("");}
    }catch{if(epoch===requestEpoch.current)setError("Connection unavailable. Session remains on the server.");}
  },[apply]);
  useEffect(()=>{
    void refresh();
    const sync=window.setInterval(()=>void refresh(),5000);
    const tick=window.setInterval(()=>setNow(Date.now()),500);
    return()=>{window.clearInterval(sync);window.clearInterval(tick);requestEpoch.current++;};
  },[refresh]);
  const command=async(c:LockInCommand)=>{
    if(busy.current)return;
    busy.current=true;requestEpoch.current++;setPending(true);setError("");setNotice("");
    try{
      const t=Date.now(),r=await fetch("/api/lock-in",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(c),signal:AbortSignal.timeout(10000)});
      const s=await r.json();
      if(!r.ok||!s.ok)throw new Error(typeof s.error==="string"?s.error:"Update failed");
      apply(s as Snapshot,t);
      if(c.command==="start")startId.current=null;
      if(c.command==="save")setNotice("Session saved. Completed focus minutes appear in Focus.");
      if(c.command==="discard")setNotice("Session discarded; no focus log was created.");
    }catch(e){setError(e instanceof Error?e.message:"Connection unavailable");}
    finally{busy.current=false;setPending(false);void refresh();}
  };
  const s=snapshot?.session;
  const phase=s?roomPhase(s.config,s.clock,Math.max(s.clock.startedAtMs,s.clock.pausedAtMs??0,now+offset)):null;
  return <div className="tk-stack">
    {error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
    {!snapshot?<p className="tk-empty">Connecting to your session...</p>:s&&phase?<div className="tk-timer">
      <p className="tk-kicker">{s.label||"Untitled focus"} · Round {phase.round}/{s.config.rounds}</p>
      <p>{phase.paused?"Paused":phase.phase.replaceAll("_"," ")}</p>
      <output className="tk-timer-time" aria-live="off">{display(phase.remainingMs)}</output>
      <div className="tk-timer-controls">
        {phase.phase!=="complete"?<button className="tk-button" disabled={pending} onClick={()=>void command({command:phase.paused?"resume":"pause",id:s.id,revision:s.clock.revision})}>{phase.paused?"Resume":"Pause"}</button>:null}
        <button className="tk-button tk-primary" disabled={pending} onClick={()=>void command({command:"save",id:s.id,revision:s.clock.revision})}>End &amp; save</button>
        <button className="tk-button tk-ghost" disabled={pending} onClick={()=>{if(window.confirm("Discard this session without creating a focus log?"))void command({command:"discard",id:s.id,revision:s.clock.revision});}}>Discard</button>
      </div>
    </div>:<form className="tk-stack" onSubmit={e=>{e.preventDefault();startId.current??=crypto.randomUUID();void command({command:"start",id:startId.current,label,config});}}>
      <label className="tk-field"><span>Intention</span><input value={label} maxLength={200} placeholder="Physics revision, coding..." onChange={e=>{startId.current=null;setLabel(e.target.value);}} disabled={pending}/></label>
      <div className="tk-timer-controls">{PRESETS.map(p=><button key={p.name} type="button" className="tk-button" aria-pressed={JSON.stringify(config)===JSON.stringify(p.config)} onClick={()=>{startId.current=null;setConfig(p.config);}} disabled={pending}>{p.name}</button>)}</div>
      <p>{config.focusMs/60000} min focus · {config.shortBreakMs/60000} min break · {config.rounds} rounds</p>
      <button className="tk-button tk-primary" disabled={pending} type="submit">{pending?"Connecting...":"Start lock-in"}</button>
    </form>}
    <h3>Recent sessions</h3>
    {!snapshot?.recent.length?<p className="tk-empty">No completed lock-in sessions yet.</p>:<ul className="tk-list">{snapshot.recent.map(r=><li key={r.id}><span>{r.label||"Untitled"}</span><small>{r.outcome==="saved"?Math.floor((r.focusMs??0)/60000)+" min planned focus":"Discarded"}</small></li>)}</ul>}
  </div>;
}
