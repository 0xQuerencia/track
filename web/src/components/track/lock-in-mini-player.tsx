"use client";
import Link from "next/link";
import {Timer} from "lucide-react";
import {useEffect,useState} from "react";
import {roomPhase} from "@/lib/lock-in/clock";
import type {Session} from "@/lib/lock-in/sessions";

type Snapshot={session:Session|null;serverNow:number;received:number};
export function LockInMiniPlayer(){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [now,setNow]=useState(0);
  useEffect(()=>{
    let disposed=false;
    let controller:AbortController|null=null;
    async function refresh(){
      if(disposed||document.hidden)return;
      controller?.abort();
      const current=new AbortController();
      controller=current;
      try{
        const result=await fetch("/api/lock-in?active=1",{cache:"no-store",signal:current.signal});
        if(!result.ok)return;
        const data=await result.json();
        if(!disposed&&!current.signal.aborted&&data.ok){
          const received=Date.now();
          setSnapshot({session:data.session,serverNow:data.serverNow,received});
          setNow(received);
        }
      }catch{/* A stale snapshot never controls a session. */}
    }
    const first=window.setTimeout(()=>void refresh(),0);
    const poll=window.setInterval(()=>void refresh(),10000);
    const tick=window.setInterval(()=>{if(!document.hidden)setNow(Date.now());},1000);
    const visible=()=>void refresh();
    document.addEventListener("visibilitychange",visible);
    return ()=>{disposed=true;controller?.abort();window.clearTimeout(first);window.clearInterval(poll);window.clearInterval(tick);document.removeEventListener("visibilitychange",visible);};
  },[]);
  const s=snapshot?.session;
  let label="Lock in";
  if(s&&snapshot){
    if(now-snapshot.received>30000)label="Lock-In · reconnect";
    else{
      const time=Math.max(snapshot.serverNow,snapshot.serverNow+now-snapshot.received);
      const phase=roomPhase(s.config,s.clock,time);
      const seconds=Math.ceil(phase.remainingMs/1000);
      label=phase.phase==="complete"?"Finish session":phase.paused?"Paused":(s.config.mode==="flow"?"Flow":phase.phase==="focus"?"Focus":"Break")+" · "+Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");
    }
  }
  return <Link href="/lock-in" className="tk-button tk-ghost" aria-label={label+" — open Lock-In"}><Timer size={15} aria-hidden="true"/><span>{label}</span></Link>;
}
