import {blockConfig,isBlockRule,BLOCK_ALARM} from "./blocker.mjs";
import {classifyUrl,validateRules} from "./rules.mjs";
import {sampleInterval,appendQueue,pruneQueue,acceptAck,backoffMs} from "./tracker.mjs";
const KEY="pulseState";
let serial=Promise.resolve();
function run(fn){const next=serial.then(fn,fn);serial=next.catch(()=>{});return next;}
const empty=()=>({enabled:false,server:"",token:"",last:null,queue:[],dropped:0,failures:0,nextSyncMs:0,error:"",domainRulesEnabled:false,rules:[],excluded:[],blockUntil:0,blockDomains:[]});
async function load(){const old=(await chrome.storage.local.get(KEY))[KEY];return old?{...empty(),...old,last:typeof old.last==="number"?null:old.last}:empty();}
async function save(s){await chrome.storage.local.set({[KEY]:s});}
async function observe(s){
  const [windows,idle]=await Promise.all([chrome.windows.getAll({windowTypes:["normal"]}),chrome.idle.queryState(60)]);
  const window=windows.find(w=>w.focused&&!w.incognito);
  if(idle!=="active"||!window)return null;
  if(!s.domainRulesEnabled)return {};
  if(!await chrome.permissions.contains({permissions:["tabs"]}))return null;
  const [tab]=await chrome.tabs.query({active:true,windowId:window.id});
  return tab?.url?classifyUrl(tab.url,s.rules,s.excluded):null;
}
async function sample(){
  const s=await load(),now=Date.now();
  if(!s.enabled){s.last=null;await save(s);return;}
  let observed=null;
  try{observed=await observe(s);}catch{/* Unknown state is never counted. */}
  const next=sampleInterval(s.last,now,observed,()=>crypto.randomUUID());
  Object.assign(s,appendQueue(s.queue,next.event,s.dropped),{last:next.last});
  await save(s);
}
async function flush(force=false){
  const s=await load(),now=Date.now();
  if(!s.enabled||!s.server||!s.token||!s.queue.length||(!force&&s.nextSyncMs>now))return;
  Object.assign(s,pruneQueue(s.queue,now,s.dropped));await save(s);
  const batch=s.queue.slice(0,200);if(!batch.length)return;
  try{
    const response=await fetch(s.server+"/api/integrations/activity",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+s.token},body:JSON.stringify(batch),redirect:"error",credentials:"omit",signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error(response.status===401||response.status===403?"Token rejected; check Track Settings":"Server returned "+response.status);
    const result=await response.json();
    if(!result.ok)throw new Error("Invalid acknowledgment");
    s.queue=acceptAck(s.queue,batch,result.ack);s.error="";s.failures=0;s.nextSyncMs=0;s.lastSync=Date.now();
  }catch(e){s.error=e instanceof Error?e.message:"Sync unavailable";s.failures++;s.nextSyncMs=Date.now()+backoffMs(s.failures);}
  await save(s);
}
async function clearBlock(s){
  const rules=await chrome.declarativeNetRequest.getSessionRules();
  await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:rules.filter(r=>isBlockRule(r.id)).map(r=>r.id)});
  await chrome.alarms.clear(BLOCK_ALARM);
  if(s.blockDomains.length){const origins=blockConfig(s.blockDomains,1,"").origins;await chrome.permissions.remove({origins});}
  s.blockUntil=0;s.blockDomains=[];await save(s);
}
async function startBlock(s,domains,minutes){
  const c=blockConfig(domains,minutes,s.server);
  if(!await chrome.permissions.contains({origins:c.origins}))throw new Error("Site permissions required.");
  if(s.blockUntil)throw new Error("Stop the existing block first.");
  s.blockUntil=Date.now()+c.minutes*60000;s.blockDomains=c.domains;await save(s);
  try{await chrome.alarms.create(BLOCK_ALARM,{when:s.blockUntil});await chrome.declarativeNetRequest.updateSessionRules({addRules:c.rules});}catch(e){await clearBlock(s);throw e;}
}
async function tick(force=false){const s=await load();if(s.blockUntil&&s.blockUntil<=Date.now())await clearBlock(s);await sample();await flush(force);}
async function resetSample(){const s=await load();s.last=null;await clearBlock(s);await chrome.alarms.create("pulse",{periodInMinutes:0.5});}
chrome.alarms.onAlarm.addListener(a=>{if(a.name==="pulse")void run(tick).catch(()=>{});else if(a.name===BLOCK_ALARM)void run(async()=>clearBlock(await load())).catch(()=>{});});
chrome.windows.onFocusChanged.addListener(()=>void run(sample).catch(()=>{}));
chrome.tabs.onActivated.addListener(()=>void run(sample).catch(()=>{}));
chrome.tabs.onUpdated.addListener((_id,change)=>{if(change.url||change.status==="complete")void run(sample).catch(()=>{});});
chrome.idle.onStateChanged.addListener(()=>void run(sample).catch(()=>{}));
chrome.runtime.onInstalled.addListener(()=>void run(resetSample).catch(()=>{}));
chrome.runtime.onStartup.addListener(()=>void run(resetSample).catch(()=>{}));
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL("popup.html"))return false;
  void run(async()=>{
    const s=await load();
    if(m.type==="pair"){
      const url=new URL(m.server);
      if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/"||!/^trk_[A-Za-z0-9_-]{43}$/.test(m.token))throw new Error("Use an HTTPS server origin and an activity-only token.");
      if(!await chrome.permissions.contains({origins:[url.origin+"/*"]}))throw new Error("Server permission required.");
      await save({...empty(),enabled:true,server:url.origin,token:m.token});await resetSample();await tick(true);
    }else if(m.type==="pause"){s.enabled=false;s.last=null;await save(s);}
    else if(m.type==="resume"){if(!s.token)throw new Error("Pair first.");s.enabled=true;s.last=null;await save(s);await tick(true);}
    else if(m.type==="disconnect"){await clearBlock(s);await save(empty());if(s.server)await chrome.permissions.remove({origins:[s.server+"/*"]});await chrome.permissions.remove({permissions:["tabs"]});}
    else if(m.type==="start-block"){if(!s.token)throw new Error("Pair first.");await startBlock(s,m.domains,m.minutes);}
    else if(m.type==="stop-block"){await clearBlock(s);}
    else if(m.type==="rules"){
      if(!s.token)throw new Error("Pair first.");
      if(m.enabled===true){
        if(!await chrome.permissions.contains({permissions:["tabs"]}))throw new Error("Tab permission is required for local rules.");
        Object.assign(s,validateRules(m.rules,m.excluded),{domainRulesEnabled:true,last:null});
      }else{Object.assign(s,{domainRulesEnabled:false,rules:[],excluded:[],last:null});await chrome.permissions.remove({permissions:["tabs"]});}
      await save(s);
    }
    else if(m.type==="sync")await tick(true);
    else if(m.type!=="status")throw new Error("Unknown command");
    const next=await load();reply({ok:true,enabled:next.enabled,server:next.server,queued:next.queue.length,dropped:next.dropped,lastSync:next.lastSync,error:next.error,domainRulesEnabled:next.domainRulesEnabled,rules:next.rules,excluded:next.excluded,blockUntil:next.blockUntil,blockDomains:next.blockDomains});
  }).catch(e=>reply({ok:false,error:e instanceof Error?e.message:"Request failed"}));return true;
});
