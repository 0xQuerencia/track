const $=id=>document.getElementById(id);
async function send(type,extra={}){
  try{
    const s=await chrome.runtime.sendMessage({type,...extra});
    if(!s.ok){$("status").textContent=s.error;return;}
    $("pair").hidden=!!s.server;$("controls").hidden=!s.server;
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
send("status");
