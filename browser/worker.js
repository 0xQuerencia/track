// No tab URLs or titles are requested. Local state persists across MV3 suspension.
const KEY="pulseState", PERIOD=30000, MAX_GAP=90000, MAX_QUEUE=2880;
let serial=Promise.resolve();
function run(fn){serial=serial.then(fn,fn).catch(()=>{});return serial;}
async function load(){return (await chrome.storage.local.get(KEY))[KEY]??{enabled:false,server:"",token:"",last:null,queue:[],dropped:0};}
async function save(s){await chrome.storage.local.set({[KEY]:s});}
async function active(){
  const [windows,idle]=await Promise.all([chrome.windows.getAll({windowTypes:["normal"]}),chrome.idle.queryState(60)]);
  return idle==="active"&&windows.some(w=>w.focused&&!w.incognito);
}
async function sample(){
  const s=await load(),now=Date.now();
  if(!s.enabled){s.last=null;await save(s);return;}
  const current=await active();
  if(s.last!==null&&current&&now>s.last&&now-s.last<=MAX_GAP){
    if(s.queue.length>=MAX_QUEUE){s.queue.shift();s.dropped++;}
    s.queue.push({eventId:crypto.randomUUID(),source:"browser",startMs:s.last,endMs:now});
  }
  s.last=current?now:null;
  await save(s);
}
async function flush(){
  const s=await load();
  if(!s.enabled||!s.server||!s.token||!s.queue.length)return;
  // Server accepts a 30-day window. Old data is explicitly counted as dropped.
  const cutoff=Date.now()-30*86400000;
  const prior=s.queue.length;s.queue=s.queue.filter(e=>e.startMs>=cutoff);s.dropped+=prior-s.queue.length;await save(s);
  const batch=s.queue.slice(0,200);if(!batch.length)return;
  try{
    const response=await fetch(s.server+"/api/integrations/activity",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+s.token},body:JSON.stringify(batch),redirect:"error",credentials:"omit",signal:AbortSignal.timeout(10000)});
    if(!response.ok){s.error="Server returned "+response.status;await save(s);return;}
    const result=await response.json();
    if(!result.ok||!Array.isArray(result.ack))throw new Error("Bad ack");
    const requested=new Set(batch.map(e=>e.eventId));const ack=new Set(result.ack.filter(id=>requested.has(id)));
    s.queue=s.queue.filter(e=>!ack.has(e.eventId));s.error="";s.lastSync=Date.now();await save(s);
  }catch{s.error="Sync unavailable";await save(s);}
}
async function tick(){await sample();await flush();}
chrome.alarms.onAlarm.addListener(a=>{if(a.name==="pulse")run(tick);});
chrome.windows.onFocusChanged.addListener(()=>run(sample));
chrome.idle.onStateChanged.addListener(()=>run(sample));
chrome.runtime.onInstalled.addListener(()=>chrome.alarms.create("pulse",{periodInMinutes:0.5}));
chrome.runtime.onStartup.addListener(()=>run(async()=>{const s=await load();s.last=null;await save(s);await chrome.alarms.create("pulse",{periodInMinutes:0.5});}));
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL("popup.html"))return false;
  run(async()=>{
    try{
      const s=await load();
      if(m.type==="pair"){
        const url=new URL(m.server);
        if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/"||!/^trk_[A-Za-z0-9_-]{43}$/.test(m.token))throw new Error("Use an HTTPS server origin and an activity-only token.");
        if(!await chrome.permissions.contains({origins:[url.origin+"/*"]}))throw new Error("Server permission required.");
        await save({enabled:true,server:url.origin,token:m.token,last:null,queue:[],dropped:0});await tick();
      }else if(m.type==="pause"){s.enabled=false;s.last=null;await save(s);}
      else if(m.type==="resume"){if(!s.token)throw new Error("Pair first.");s.enabled=true;s.last=null;await save(s);await tick();}
      else if(m.type==="disconnect"){await save({enabled:false,server:"",token:"",last:null,queue:[],dropped:0});}
      else if(m.type==="sync")await tick();
      const next=await load();reply({ok:true,enabled:next.enabled,server:next.server,queued:next.queue.length,dropped:next.dropped,lastSync:next.lastSync,error:next.error});
    }catch(e){reply({ok:false,error:e instanceof Error?e.message:"Request failed"});}
  });return true;
});
