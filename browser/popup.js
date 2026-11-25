import {blockConfig} from "./blocker.mjs";
import {parseRuleText} from "./rules.mjs";
const $=id=>document.getElementById(id);
let pairedServer="";
async function send(type,extra={}){
  try{
    const s=await chrome.runtime.sendMessage({type,...extra});
    if(!s.ok){$("status").textContent=s.error;return;}
    $("pair").hidden=!!s.server;$("controls").hidden=!s.server;$("rule-settings").hidden=!s.server;$("block-settings").hidden=!s.server;pairedServer=s.server;
    const blocking=Number(s.blockUntil)>Date.now();$("block-form").hidden=blocking;$("stop-block").hidden=!blocking;$("block-status").textContent=blocking?"Blocking until "+new Date(s.blockUntil).toLocaleTimeString():"No active block";if(blocking)$("block-settings").open=true;
    if(type==="status"||type==="rules"||type==="pair"){ $("rule-text").value=(s.rules??[]).map(r=>r.suffix+","+r.category).join("\n");$("exclusions").value=(s.excluded??[]).join("\n"); }
    $("enable-rules").textContent=s.domainRulesEnabled?"Update rules":"Enable and save rules";
    $("pause").textContent=s.enabled?"Pause":"Resume";
    $("pause").dataset.enabled=String(s.enabled);
    $("status").textContent=(s.enabled?"Tracking":"Paused")+" · "+s.queued+" queued · "+s.dropped+" dropped"+(s.error?" · "+s.error:"");
  }catch{$("status").textContent="Extension unavailable";}
}
$("pair").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    const url=new URL($("server").value);
    if(url.protocol!=="https:"||url.pathname!=="/"||url.username||url.password||url.search||url.hash)throw new Error("Enter an HTTPS server origin.");
    if(!await chrome.permissions.request({origins:[url.origin+"/*"]}))throw new Error("Permission denied.");
    await send("pair",{server:url.origin,token:$("token").value.trim()});$("token").value="";
  }catch(e){$("status").textContent=e.message;}
});
$("pause").onclick=()=>send($("pause").dataset.enabled==="true"?"pause":"resume");
$("sync").onclick=()=>send("sync");
$("disconnect").onclick=()=>send("disconnect");
$("rules").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    const config=parseRuleText($("rule-text").value,$("exclusions").value);
    if(!await chrome.permissions.request({permissions:["tabs"]}))throw new Error("Tab permission denied.");
    await send("rules",{enabled:true,...config});
  }catch(e){$("status").textContent=e.message;}
});
$("disable-rules").onclick=()=>send("rules",{enabled:false});
$("block-form").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    const c=blockConfig($("block-domains").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),Number($("block-minutes").value),pairedServer);
    if(!await chrome.permissions.request({origins:c.origins}))throw new Error("Site permission denied.");
    await send("start-block",{domains:c.domains,minutes:c.minutes});
  }catch(e){$("status").textContent=e.message;}
});
$("stop-block").onclick=()=>send("stop-block");
send("status");
