import {focusLease} from "./focus-policy.mjs";
import {blockConfig,isBlockRule,BLOCK_ALARM} from "./blocker.mjs";
import {classifyUrl,validateRules} from "./rules.mjs";
import {sampleInterval,appendQueue,pruneQueue,acceptAck,backoffMs} from "./tracker.mjs";
const api=globalThis.browser??globalThis.chrome;
const KEY="pulseState";
let serial=Promise.resolve();
function run(fn){const next=serial.then(fn,fn);serial=next.catch(()=>{});return next;}
const empty=()=>({enabled:false,server:"",token:"",last:null,queue:[],dropped:0,failures:0,nextSyncMs:0,error:"",domainRulesEnabled:false,rules:[],excluded:[],blockUntil:0,blockDomains:[],autoFocus:false,autoDomains:[],autoStatus:""});
async function load(){const old=(await api.storage.local.get(KEY))[KEY];return old?{...empty(),...old,last:typeof old.last==="number"?null:old.last}:empty();}
async function save(s){await api.storage.local.set({[KEY]:s});}
async function observe(s){
  const [windows,idle]=await Promise.all([api.windows.getAll({windowTypes:["normal"]}),api.idle.queryState(60)]);
  const window=windows.find(w=>w.focused&&!w.incognito);
  if(idle!=="active"||!window)return null;
  if(!s.domainRulesEnabled)return {};
  if(!await api.permissions.contains({permissions:["tabs"]}))return null;
  const [tab]=await api.tabs.query({active:true,windowId:window.id});
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
async function clearBlock(s,keepOrigins=false){
  const rules=await api.declarativeNetRequest.getSessionRules();
  await api.declarativeNetRequest.updateSessionRules({removeRuleIds:rules.filter(r=>isBlockRule(r.id)).map(r=>r.id)});
  await api.alarms.clear(BLOCK_ALARM);
  if(!keepOrigins&&s.blockDomains.length){const origins=blockConfig(s.blockDomains,1,"").origins;await api.permissions.remove({origins});}
  s.blockUntil=0;s.blockDomains=[];await save(s);
}
async function startBlock(s,domains,minutes){
  if(s.autoFocus)throw new Error("Disable automatic focus blocking first.");
  const c=blockConfig(domains,minutes,s.server);
  if(!await api.permissions.contains({origins:c.origins}))throw new Error("Site permissions required.");
  if(s.blockUntil)throw new Error("Stop the existing block first.");
  s.blockUntil=Date.now()+c.minutes*60000;s.blockDomains=c.domains;await save(s);
  try{await api.alarms.create(BLOCK_ALARM,{when:s.blockUntil});await api.declarativeNetRequest.updateSessionRules({addRules:c.rules});}catch(e){await clearBlock(s);throw e;}
}
async function stopAuto(s){
  const domains=s.autoDomains;
  s.autoFocus=false;s.autoDomains=[];s.autoStatus="";
  await clearBlock(s,true);
  if(domains.length)await api.permissions.remove({origins:blockConfig(domains,1,"").origins});
  await save(s);
}
async function followFocus(s){
  if(!s.autoFocus)return;
  let expiry=0,status="Not in a focus phase";
  try{
    const config=blockConfig(s.autoDomains,1,s.server);
    if(!await api.permissions.contains({origins:config.origins}))throw new Error("Site permissions revoked");
    const start=Date.now();
    const response=await fetch(s.server+"/api/integrations/focus",{headers:{authorization:"Bearer "+s.token},redirect:"error",credentials:"omit",cache:"no-store",signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error(response.status===403?"Token needs focus:read scope":"Focus status unavailable");
    const result=await response.json(),now=Date.now();
    expiry=focusLease(result,now,Math.max(0,now-start));
    if(expiry){
      const rules=await api.declarativeNetRequest.getSessionRules();
      await api.alarms.create(BLOCK_ALARM,{when:expiry});
      await api.declarativeNetRequest.updateSessionRules({removeRuleIds:rules.filter(r=>isBlockRule(r.id)).map(r=>r.id),addRules:config.rules});
      s.blockUntil=expiry;s.blockDomains=config.domains;s.autoStatus="Following focus phase";
      await save(s);return;
    }
  }catch(e){status=e instanceof Error?e.message:"Focus status unavailable";}
  s.autoStatus=status;await clearBlock(s,true);
}
async function startAuto(s,domains){
  if(s.blockUntil||s.autoFocus)throw new Error("Stop the current block first.");
  const config=blockConfig(domains,1,s.server);
  if(!s.token||!await api.permissions.contains({origins:config.origins}))throw new Error("Pair and grant site permissions first.");
  s.autoFocus=true;s.autoDomains=config.domains;s.autoStatus="Connecting";await save(s);await followFocus(s);
}
async function tick(force=false){
  const s=await load();
  if(s.blockUntil&&s.blockUntil<=Date.now())await clearBlock(s,s.autoFocus);
  if(s.autoFocus)await followFocus(s);
  await sample();await flush(force);
}
async function resetSample(){const s=await load();s.last=null;if(s.autoFocus)await stopAuto(s);else await clearBlock(s);await api.alarms.create("pulse",{periodInMinutes:0.5});}
api.alarms.onAlarm.addListener(a=>{if(a.name==="pulse")void run(tick).catch(()=>{});else if(a.name===BLOCK_ALARM)void run(async()=>{const s=await load();if(s.blockUntil<=Date.now())await clearBlock(s,s.autoFocus);}).catch(()=>{});});
api.windows.onFocusChanged.addListener(()=>void run(sample).catch(()=>{}));
api.tabs.onActivated.addListener(()=>void run(sample).catch(()=>{}));
api.tabs.onUpdated.addListener((_id,change)=>{if(change.url||change.status==="complete")void run(sample).catch(()=>{});});
api.idle.onStateChanged.addListener(()=>void run(sample).catch(()=>{}));
api.runtime.onInstalled.addListener(()=>void run(resetSample).catch(()=>{}));
api.runtime.onStartup.addListener(()=>void run(resetSample).catch(()=>{}));
api.runtime.onMessage.addListener((m,sender,reply)=>{
  if(sender.id!==api.runtime.id||sender.url!==api.runtime.getURL("popup.html"))return false;
  void run(async()=>{
    const s=await load();
    if(m.type==="pair"){
      const url=new URL(m.server);
      if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/"||!/^trk_[A-Za-z0-9_-]{43}$/.test(m.token))throw new Error("Use an HTTPS server origin and an activity-only token.");
      if(!await api.permissions.contains({origins:[url.origin+"/*"]}))throw new Error("Server permission required.");
      await save({...empty(),enabled:true,server:url.origin,token:m.token});await resetSample();await tick(true);
    }else if(m.type==="pause"){s.enabled=false;s.last=null;await save(s);}
    else if(m.type==="resume"){if(!s.token)throw new Error("Pair first.");s.enabled=true;s.last=null;await save(s);await tick(true);}
    else if(m.type==="disconnect"){if(s.autoFocus)await stopAuto(s);else await clearBlock(s);await save(empty());if(s.server)await api.permissions.remove({origins:[s.server+"/*"]});await api.permissions.remove({permissions:["tabs"]});}
    else if(m.type==="start-block"){if(!s.token)throw new Error("Pair first.");await startBlock(s,m.domains,m.minutes);}
    else if(m.type==="start-auto"){await startAuto(s,m.domains);}
    else if(m.type==="stop-block"){if(s.autoFocus)await stopAuto(s);else await clearBlock(s); }
    else if(m.type==="rules"){
      if(!s.token)throw new Error("Pair first.");
      if(m.enabled===true){
        if(!await api.permissions.contains({permissions:["tabs"]}))throw new Error("Tab permission is required for local rules.");
        Object.assign(s,validateRules(m.rules,m.excluded),{domainRulesEnabled:true,last:null});
      }else{Object.assign(s,{domainRulesEnabled:false,rules:[],excluded:[],last:null});await api.permissions.remove({permissions:["tabs"]});}
      await save(s);
    }
    else if(m.type==="sync")await tick(true);
    else if(m.type!=="status")throw new Error("Unknown command");
    const next=await load();reply({ok:true,enabled:next.enabled,server:next.server,queued:next.queue.length,dropped:next.dropped,lastSync:next.lastSync,error:next.error,domainRulesEnabled:next.domainRulesEnabled,rules:next.rules,excluded:next.excluded,blockUntil:next.blockUntil,blockDomains:next.blockDomains,autoFocus:next.autoFocus,autoStatus:next.autoStatus});
  }).catch(e=>reply({ok:false,error:e instanceof Error?e.message:"Request failed"}));return true;
});
