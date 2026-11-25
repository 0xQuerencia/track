import {remainingAt,formatRemaining,phaseLabel} from "./room-time.mjs";
export function createRoomUI({view,api,post,el,button,row,section,field,input,select,inlineForm,notify,account,podRole}){
 let id=null,snapshot=null,received=0,epoch=0,poll=null,tick=null,heartbeat=null,chatPoll=null,loading=false,chatLoading=false;
 let title,status,timer,controls,people,chat,messages,chatForm,chatInput,chatSend,controlKey="",peopleKey="",draftId=null;
 function close(){
  epoch++;id=null;snapshot=null;loading=false;chatLoading=false;draftId=null;
  for(const t of [poll,tick,heartbeat,chatPoll])clearInterval(t);
  view.replaceChildren();view.hidden=true;
 }
 function valid(key){return key===epoch&&id!==null;}
 function updateTime(){
  if(!snapshot)return;
  timer.textContent=formatRemaining(remainingAt(snapshot,received,performance.now()));
 }
 function apply(next){
  if(next.id!==id||snapshot&&(next.revision<snapshot.revision||next.serverNow<snapshot.serverNow))return;
  snapshot=next;received=performance.now();title.textContent=next.objective;
  status.textContent=phaseLabel(next.phase)+(next.paused?" · Room paused":"")+(next.round?" · Round "+next.round+"/"+next.config.rounds:"");
  updateTime();
  const self=next.participants.find(p=>p.id===account()?.id),host=next.hostId===account()?.id;
  const moderator=["owner","moderator"].includes(podRole());
  const connected=next.participants.filter(p=>p.connected&&p.id!==next.hostId);
  const key=JSON.stringify([next.revision,next.state,next.phase,next.paused,next.joined,next.scheduledMs!==null&&next.serverNow<next.scheduledMs,self?.ready,self?.personalPaused,host,moderator,next.participants.map(p=>[p.id,p.ready,p.connected])]);
  if(key!==controlKey){
   controlKey=key;controls.replaceChildren();
   if(next.state!=="ended"){
    if(!next.joined)controls.append(button("Join room",()=>command("join"),"primary"));
    else{
     if(next.state==="lobby")controls.append(button(self?.ready?"Not ready":"Ready",()=>command("ready",{ready:!self?.ready}),"primary"));
     if(next.state==="running"&&next.phase!=="complete")controls.append(button(self?.personalPaused?"Resume personally":"Personal pause",()=>command("personal-pause",{paused:!self?.personalPaused})));
     controls.append(button("Leave room",async()=>{if(confirm("Leave this room? The group timer will continue."))await command("leave");}));
    }
    if(host&&next.state==="lobby"){
     const start=button("Start together",()=>command("start",{revision:snapshot.revision}),"primary");
     start.disabled=!next.joined||!next.participants.length||next.participants.some(p=>!p.ready||!p.connected)||(next.scheduledMs!==null&&next.serverNow<next.scheduledMs);
     controls.append(start);
    }
    if(host&&next.state==="running"&&next.phase!=="complete")controls.append(button(next.paused?"Resume group":"Pause group",()=>command(next.paused?"resume":"pause",{revision:snapshot.revision})));
    if(host)controls.append(button("End room",async()=>{if(confirm("End the shared room for everyone?"))await command("end",{revision:snapshot.revision});},"danger"));
    if((host||moderator&&!next.participants.some(p=>p.id===next.hostId&&p.connected))&&connected.length){
     controls.append(inlineForm([field("Transfer host",select("accountId",connected.map(p=>[p.id,p.displayName])))],"Transfer",data=>command("transfer",{...data,revision:snapshot.revision})));
    }
   }
  }
  const rosterKey=JSON.stringify(next.participants);
  if(rosterKey!==peopleKey){
   peopleKey=rosterKey;people.replaceChildren();
   for(const p of next.participants)people.append(row(p.displayName,(p.id===next.hostId?"Host · ":"")+(p.connected?"Connected":"Disconnected")+(p.ready?" · Ready":"")+(p.personalPaused?" · Personal pause":"")));
   if(!next.participants.length)people.append(el("p","No participants.","muted"));
  }
  chat.hidden=!next.joined;
  const canChat=next.joined&&["waiting","short_break","long_break"].includes(next.phase);
  chatInput.disabled=!canChat;chatSend.disabled=!canChat;
  if(!next.joined)messages.replaceChildren();
 }
 async function refresh(){
  if(!id||loading||document.hidden)return;
  const key=epoch,path="/v1/rooms/"+id;loading=true;
  try{const data=await api(path);if(valid(key))apply(data.room);}
  catch(e){if(valid(key)){if(e.status===404||e.status===403){close();notify("Room is no longer available.",true);}else status.textContent="Reconnecting · last snapshot may be stale";}}
  finally{if(valid(key))loading=false;}
 }
 async function command(action,data={}){
  if(!id)return;
  const key=epoch,result=await post("/v1/rooms/"+id+"/"+action,data);
  if(valid(key)){apply(result.room);await refreshChat();}
 }
 async function refreshChat(){
  if(!id||!snapshot?.joined||chatLoading||document.hidden)return;
  const key=epoch;chatLoading=true;
  try{
   const result=await api("/v1/rooms/"+id+"/chat");if(!valid(key)||!snapshot?.joined)return;
   messages.replaceChildren();
   for(const m of result.messages){
    const actions=[];
    if(m.authorId===account()?.id||snapshot.hostId===account()?.id||["owner","moderator"].includes(podRole()))actions.push(button("Delete",async()=>{if(confirm("Delete this message?")){await post("/v1/rooms/"+id+"/chat/delete",{messageId:m.id});await refreshChat();}},"danger"));
    messages.append(row(m.displayName,m.body,actions));
   }
   if(!result.messages.length)messages.append(el("p","No messages yet.","muted"));
  }catch(e){if(valid(key))messages.replaceChildren(el("p","Chat unavailable. Refreshing when connected.","muted"));}
  finally{if(valid(key))chatLoading=false;}
 }
 async function sendChat(){
  if(!id||!snapshot?.joined||!chatInput.value.trim())return;
  const key=epoch;draftId??=crypto.randomUUID();
  const body=chatInput.value,clientId=draftId;
  await post("/v1/rooms/"+id+"/chat",{body,clientId});
  if(valid(key)&&draftId===clientId){chatInput.value="";draftId=null;await refreshChat();}
 }
 async function open(roomId){
  close();id=roomId;const key=epoch;controlKey="";peopleKey="";
  view.hidden=false;view.replaceChildren();
  const heading=el("div",undefined,"section-head");title=el("h2","Connecting to room…");
  heading.append(title,button("Close room view",close));status=el("p","Waiting for snapshot","muted");status.setAttribute("role","status");
  timer=el("output","—","timer");timer.setAttribute("aria-live","off");
  controls=el("div",undefined,"room-controls");people=el("div",undefined,"stack");
  const participants=section("Participants");participants.append(people);
  chat=section("Break chat");messages=el("div",undefined,"stack");chat.hidden=true;
  chatInput=input("body","Message during lobby or break");chatInput.maxLength=500;
  chatInput.addEventListener("input",()=>{draftId=null;});
  chatForm=inlineForm([field("Message",chatInput)],"Send",sendChat);chatSend=chatForm.querySelector("button");
  chat.append(el("p","Chat is available only in the lobby and scheduled breaks.","muted"),messages,chatForm);
  view.append(el("p","LOCK-IN / SHARED ROOM","eyebrow"),heading,status,timer,controls,participants,chat,el("p","Closing this view stops your heartbeat but does not leave the room. Leave explicitly if you are finished.","muted"));
  await refresh();if(!valid(key))return;
  await refreshChat();if(!valid(key))return;
  poll=setInterval(()=>void refresh(),4000);
  tick=setInterval(updateTime,500);
  heartbeat=setInterval(()=>{if(id&&snapshot?.joined&&snapshot.state!=="ended"&&!document.hidden)void command("heartbeat").catch(()=>{});},20000);
  chatPoll=setInterval(()=>void refreshChat(),10000);
  view.scrollIntoView({block:"start",behavior:"instant"});
 }
 return {open,close,current:()=>id,refresh};
}
