"use client";
import {useActionState,useState} from "react";
import {createIntegrationTokenAction,type TokenActionState} from "@/app/settings/actions";
export function PulsePairingForm(){
  const [state,action,pending]=useActionState<TokenActionState,FormData>(createIntegrationTokenAction,null);
  const [copied,setCopied]=useState(false);
  return <div className="tk-stack"><form action={action} className="tk-stack" onSubmit={()=>setCopied(false)}>
    <label className="tk-field"><span>Device label</span><input name="label" maxLength={80} required placeholder="Personal laptop" disabled={pending}/></label>
    <input type="hidden" name="scope" value="activity:write"/>
    <button className="tk-button tk-primary" disabled={pending}>{pending?"Creating…":"Create activity-only token"}</button>
  </form>
  {state?<p role="status">{state.message}</p>:null}
  {state?.ok&&state.token?<div className="tk-stack"><p>Copy this token to the collector now. It cannot be recovered later.</p><code style={{overflowWrap:"anywhere"}}>{state.token}</code><button className="tk-button" type="button" onClick={async()=>{try{await navigator.clipboard.writeText(state.token!);setCopied(true);}catch{setCopied(false);}}}>{copied?"Copied":"Copy token"}</button></div>:null}</div>;
}
