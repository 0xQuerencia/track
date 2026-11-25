import {createWorkspaceUI} from "./workspace-ui.mjs";
import {createRoomUI} from "./room-ui.mjs";
const $=id=>document.getElementById(id);
let token=null,me=null,selectedPod=null,friendRows=[],podRows=[],selectedPodData=null;
let generation=0;let roomUI,workspaceUI;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const button=(label,fn,cls)=>{const b=el("button",label,cls);b.type="button";b.addEventListener("click",()=>run(fn,b));return b;};
function notify(message,error=false){$("notice").textContent=message;$("notice").classList.toggle("error",error);}
function reset(){
 roomUI?.close();generation++;token=null;me=null;selectedPod=null;selectedPodData=null;friendRows=[];podRows=[];
 $("auth").hidden=false;$("dashboard").hidden=true;$("logout").hidden=true;$("identity").textContent="";
 $("pod-view").replaceChildren(el("p","Select or create a Pod to open its workspace.","muted"));$("room-view").replaceChildren();$("room-view").hidden=true;
 for(const id of ["pods","friends","blocked","presence-list"])$(id).replaceChildren();
}
async function api(path,{method="GET",data}={}){
 const requestGeneration=generation;
 const headers={accept:"application/json",...(token?{authorization:token}:{}),...(data===undefined?{}:{"content-type":"application/json"})};
 const response=await fetch(path,{method,headers,body:data===undefined?undefined:JSON.stringify(data),cache:"no-store",credentials:"omit",redirect:"error",signal:AbortSignal.timeout(10000)});
 const body=await response.json();
 if(requestGeneration!==generation)throw Error("Session changed");
 if(response.status===401&&token){reset();throw Error("Session expired. Sign in again.");}
 if(!response.ok||!body.ok){const e=Error(typeof body.error==="string"?body.error:"Request failed");e.status=response.status;throw e;}
 return body;
}
const post=(path,data)=>api(path,{method:"POST",data});
async function run(fn,control){
 if(control?.disabled)return;
 if(control)control.disabled=true;
 try{await fn();}catch(e){notify(e.message||"Request failed",true);}finally{if(control)control.disabled=false;}
}
function form(id,fn){
 $(id).addEventListener("submit",e=>{e.preventDefault();const f=e.currentTarget;void run(()=>fn(Object.fromEntries(new FormData(f)),f),f.querySelector('button:not([type="button"])'));});
}
function section(title){const s=el("section",undefined,"subsection");s.append(el("h3",title));return s;}
function row(title,subtitle,actions=[]){const r=el("div",undefined,"row"),info=el("div");info.append(el("strong",title));if(subtitle)info.append(el("small",subtitle));r.append(info,...actions);return r;}
function empty(parent,message){if(!parent.childElementCount)parent.append(el("p",message,"muted"));}
function field(label,input){const wrapper=el("label",label);wrapper.append(input);return wrapper;}
function input(name,placeholder="",type="text"){const i=el("input");i.name=name;i.placeholder=placeholder;i.type=type;i.required=true;return i;}
function select(name,options){const s=el("select");s.name=name;for(const [value,label] of options){const o=el("option",label);o.value=value;s.append(o);}return s;}
function inlineForm(fields,label,fn){const f=el("form"),b=el("button",label,"primary");f.append(...fields,b);f.addEventListener("submit",e=>{e.preventDefault();void run(()=>fn(Object.fromEntries(new FormData(f)),f),b);});return f;}
async function signedIn(result){
 generation++;token="Bearer "+result.token;me=result.account;
 $("identity").textContent="@"+me.handle;$("auth").hidden=true;$("dashboard").hidden=false;$("logout").hidden=false;
 notify("Signed in. This browser keeps your session only in memory.");await refresh();
}
form("login",async(data,f)=>{const r=await post("/v1/auth/login",data);f.reset();await signedIn(r);});
form("register",async(data,f)=>{const r=await post("/v1/auth/register",data);f.reset();await signedIn(r);});
$("logout").onclick=()=>run(async()=>{await post("/v1/auth/logout",{});reset();notify("Signed out.");},$("logout"));
$("refresh").onclick=()=>run(refresh,$("refresh"));
form("friend-request",async(data,f)=>{await post("/v1/friends/request",data);f.reset();await refreshFriends();notify("Friend request updated.");});
form("create-pod",async(data,f)=>{const r=await post("/v1/pods",data);f.reset();await refreshPods();await openPod(r.pod.id);});
form("join-pod",async(data,f)=>{const r=await post("/v1/pods/join",data);f.reset();await refreshPods();await openPod(r.id);});
form("presence",async(data)=>{await post("/v1/presence",data);await refreshPresence();notify("Presence shared for two minutes.");});
$("clear-presence").onclick=()=>run(async()=>{await api("/v1/presence",{method:"DELETE"});await refreshPresence();notify("Presence hidden.");},$("clear-presence"));
async function refreshFriends(){
 const [f,b]=await Promise.all([api("/v1/friends"),api("/v1/blocks")]);friendRows=f.accounts;
 $("friends").replaceChildren();
 for(const a of friendRows){
  const actions=[];
  if(a.state==="incoming")actions.push(button("Accept",async()=>{await post("/v1/friends/accept",{accountId:a.id});await refreshFriends();}));
  actions.push(button(a.state==="accepted"?"Remove":"Cancel",async()=>{await post("/v1/friends/remove",{accountId:a.id});await refreshFriends();await refreshPresence();}));
  actions.push(button("Block",async()=>{if(!confirm("Block @"+a.handle+" and remove friendship?"))return;await post("/v1/blocks/add",{accountId:a.id});await refreshFriends();await refreshPresence();},"danger"));
  $("friends").append(row(a.displayName,"@"+a.handle+" · "+a.state,actions));
 }
 empty($("friends"),"No friend relationships yet.");
 $("blocked").replaceChildren(...b.accounts.map(a=>row(a.displayName,"@"+a.handle,[button("Unblock",async()=>{await post("/v1/blocks/remove",{accountId:a.id});await refreshFriends();})])));
 empty($("blocked"),"No blocked accounts.");
}
async function refreshPresence(){
 const p=await api("/v1/presence");$("presence-list").replaceChildren();
 $("presence-list").append(el("p",p.own?"You: "+p.own.status+" until "+new Date(p.own.expiresMs).toLocaleTimeString():"You are hidden.","muted"));
 for(const a of p.accounts)$("presence-list").append(row(a.displayName,a.status+" · expires "+new Date(a.expiresMs).toLocaleTimeString()));
}
async function refreshPods(){
 const p=await api("/v1/pods");podRows=p.pods;$("pods").replaceChildren();
 for(const pod of podRows)$("pods").append(button(pod.name+" · "+pod.role,()=>openPod(pod.id),"list-button"+(pod.id===selectedPod?" selected":"")));
 empty($("pods"),"No Pods yet.");
}
async function refresh(){await Promise.all([refreshFriends(),refreshPresence(),refreshPods()]);if(selectedPod&&podRows.some(p=>p.id===selectedPod))await openPod(selectedPod);}
async function openPod(id){
 if(selectedPod!==id)roomUI?.close();
 selectedPod=id;
 const r=await api("/v1/pods/"+id);if(selectedPod!==id)return;
 const pod=r.pod;selectedPodData=pod;
 const target=$("pod-view");target.replaceChildren(el("p","PRIVATE POD / "+pod.role.toUpperCase(),"eyebrow"),el("h2",pod.name),el("p",pod.description||"A private shared focus space.","muted"));
 const members=section("Members");
 for(const a of pod.members){
  const actions=[];
  if(a.id!==me.id&&pod.role==="owner"&&a.role!=="owner")actions.push(button(a.role==="member"?"Make moderator":"Make member",async()=>{await post("/v1/pods/"+id+"/role",{accountId:a.id,role:a.role==="member"?"moderator":"member"});await openPod(id);}));
  if(a.id!==me.id&&a.role!=="owner"&&(pod.role==="owner"||pod.role==="moderator"&&a.role==="member"))actions.push(button("Remove",async()=>{if(confirm("Remove this member and their shared workspace/progress?")){await post("/v1/pods/"+id+"/remove",{accountId:a.id});await openPod(id);}},"danger"));
  members.append(row(a.displayName,"@"+a.handle+" · "+a.role,actions));
 }
 if(pod.role==="owner"||pod.role==="moderator"){
  const eligible=friendRows.filter(a=>a.state==="accepted"&&!pod.members.some(m=>m.id===a.id));
  if(eligible.length){
   const options=select("accountId",eligible.map(a=>[a.id,a.displayName+" (@"+a.handle+")"]));
   members.append(inlineForm([field("Invite a friend",options)],"Create one-time invitation",async data=>{
    const result=await post("/v1/pods/"+id+"/invite",data),code=el("input");code.readOnly=true;code.value=result.invite;code.setAttribute("aria-label","One-time invitation code");members.append(el("p","Share this code privately with the selected friend. It expires in 24 hours."),code,button("Copy invitation",async()=>{await navigator.clipboard.writeText(result.invite);notify("Copied invitation.");}));
   }));
  }else members.append(el("p","Accept a friend request before inviting someone.","muted"));
 }
 if(pod.role==="owner"){
  const candidates=pod.members.filter(m=>m.id!==me.id);
  if(candidates.length)members.append(inlineForm([field("New owner",select("accountId",candidates.map(a=>[a.id,a.displayName])))],"Transfer ownership",async data=>{if(!confirm("Transfer ownership of this Pod?"))return;await post("/v1/pods/"+id+"/transfer",data);await openPod(id);}));
  members.append(button("Delete Pod",async()=>{if(!confirm("Permanently delete this Pod and its shared rooms, messages, workspace and progress?"))return;await post("/v1/pods/"+id+"/delete",{confirmation:"delete"});roomUI?.close();selectedPod=null;selectedPodData=null;target.replaceChildren(el("p","Pod deleted.","muted"));await refreshPods();},"danger"));
 }
 if(pod.role!=="owner")members.append(button("Leave Pod",async()=>{if(!confirm("Leave this Pod and remove your shared workspace/progress?"))return;await post("/v1/pods/"+id+"/leave",{});roomUI?.close();selectedPod=null;selectedPodData=null;target.replaceChildren(el("p","You left the Pod.","muted"));await refreshPods();},"danger"));
 const roomSection=section("Lock-In rooms");target.append(roomSection,members);
 await renderRooms(id,roomSection);
 const workspace=section("Pod workspace"),progress=section("Shared progress");target.append(workspace,progress);
 await Promise.all([workspaceUI.render(pod,workspace),workspaceUI.progress(pod,progress)]);
 await refreshPods();
}

const presets={
 classic:{focusMs:1500000,shortBreakMs:300000,longBreakMs:900000,rounds:4,longBreakEvery:4},
 deep:{focusMs:3000000,shortBreakMs:600000,longBreakMs:1200000,rounds:2,longBreakEvery:2},
 single:{focusMs:3600000,shortBreakMs:300000,longBreakMs:900000,rounds:1,longBreakEvery:1}
};
workspaceUI=createWorkspaceUI({api,post,el,button,row,section,field,input,select,inlineForm,notify,account:()=>me,currentPod:()=>selectedPod});
roomUI=createRoomUI({view:$("room-view"),api,post,el,button,row,section,field,input,select,inlineForm,notify,account:()=>me,podRole:()=>selectedPodData?.role});
async function renderRooms(pod,target){
 const {rooms}=await api("/v1/pods/"+pod+"/rooms");
 if(selectedPod!==pod)return;
 target.replaceChildren(el("h3","Lock-In rooms"));
 for(const r of rooms.filter(r=>r.state!=="ended"))target.append(row(r.objective,r.state+(r.scheduledMs?" · "+new Date(r.scheduledMs).toLocaleString():""),[button("Open room",()=>roomUI.open(r.id))]));
 if(!rooms.some(r=>r.state!=="ended"))target.append(el("p","No open rooms.","muted"));
 const objective=input("objective","Study together");objective.maxLength=200;
 const scheduled=input("scheduled","", "datetime-local");scheduled.required=false;
 target.append(inlineForm([field("Shared objective",objective),field("Timer",select("preset",[["classic","Classic · 25/5 × 4"],["deep","Deep work · 50/10 × 2"],["single","Single focus · 60 min"]])),field("Earliest start (optional, local time)",scheduled)],"Create room",async(data,f)=>{
  const scheduledMs=data.scheduled?new Date(data.scheduled).getTime():null;
  if(scheduledMs!==null&&!Number.isFinite(scheduledMs))throw Error("Invalid scheduled time");
  const result=await post("/v1/pods/"+pod+"/rooms",{objective:data.objective,config:presets[data.preset],...(scheduledMs===null?{}:{scheduledMs})});
  f.reset();await renderRooms(pod,target);await roomUI.open(result.room.id);
 }));
 const previous=rooms.filter(r=>r.state==="ended").slice(0,5);
 if(previous.length){const history=el("details");history.append(el("summary","Recently ended rooms"));for(const r of previous)history.append(row(r.objective,"Ended",[button("View",()=>roomUI.open(r.id))]));target.append(history);}
}
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&roomUI?.current())void roomUI.refresh();});
