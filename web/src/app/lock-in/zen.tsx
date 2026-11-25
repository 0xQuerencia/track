"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
import {phaseAlert,type PhaseMarker} from "@/lib/lock-in/alerts";
export function ZenMode({children}:{children:ReactNode}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [open,setOpen]=useState(false);
  function enter(){
    try{dialog.current?.showModal();setOpen(true);}catch{/* Dialog unavailable; timer remains accessible. */}
  }
  return <>
    <button className="tk-button" type="button" onClick={enter}>Enter Zen mode</button>
    <dialog ref={dialog} aria-label="Zen focus timer" className="lock-in-zen" onClose={()=>setOpen(false)}>
      {open?<div className="lock-in-zen-inner"><button className="tk-button" type="button" autoFocus onClick={()=>dialog.current?.close()}>Exit Zen mode (Esc)</button>{children}</div>:null}
    </dialog>
    <style jsx>{`
      .lock-in-zen{position:fixed;inset:0;margin:0;width:100vw;max-width:none;height:100dvh;max-height:none;box-sizing:border-box;background:var(--background);color:var(--foreground);border:0;padding:clamp(16px,5vw,64px);overflow:auto}
      .lock-in-zen::backdrop{background:var(--background)}
      .lock-in-zen-inner{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2rem;text-align:center}
      .lock-in-zen button:focus-visible{outline:2px solid var(--ring);outline-offset:4px}
      @media(prefers-reduced-motion:reduce){.lock-in-zen,.lock-in-zen-inner{animation:none;transition:none}}
    `}</style>
  </>;
}
export function PhaseAlerts({marker}:{marker:PhaseMarker|null}){
  const [enabled,setEnabled]=useState(false);
  const [notice,setNotice]=useState("");
  const previous=useRef<PhaseMarker|null>(null);
  const id=marker?.id,phase=marker?.phase,round=marker?.round;
  useEffect(()=>{
    const next=id&&phase&&round!==undefined?{id,phase,round}:null;
    const message=phaseAlert(previous.current,next);
    previous.current=next;
    if(!message)return;
    // Announce only a phase boundary, not every second.
    if(enabled&&"Notification" in window&&Notification.permission==="granted"){
      try{new Notification("Track Lock-In",{body:message,tag:"track-lock-in-phase"});}catch{/* Foreground announcement still works. */}
    }
    const timer=window.setTimeout(()=>setNotice(message),0);
    return()=>window.clearTimeout(timer);
  },[id,phase,round,enabled]);
  return <div className="tk-stack">
    <button className="tk-button" type="button" aria-pressed={enabled} onClick={async()=>{
      if(enabled){setEnabled(false);return;}
      if(!("Notification" in window)){setNotice("Desktop notifications are not supported here.");return;}
      try{const p=await Notification.requestPermission();setEnabled(p==="granted");setNotice(p==="granted"?"Alerts enabled while this page is open.":"Notifications not enabled.");}catch{setNotice("Notifications unavailable.");}
    }}>{enabled?"Disable phase notifications":"Enable phase notifications"}</button>
    <p role="status" aria-live="polite">{notice}</p>
    <small>Phase notifications are optional and require this page to remain open.</small>
  </div>;
}
