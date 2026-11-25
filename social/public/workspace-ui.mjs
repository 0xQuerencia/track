export function workspaceContent(kind,data){
 const result={kind,title:data.title,detail:data.detail??""};
 if(kind==="resource")result.url=data.url;
 if(kind==="event"){
  const ms=new Date(data.starts).getTime();
  if(!Number.isFinite(ms))throw Error("Choose a valid event time");
  result.startsMs=ms;
 }
 if(kind==="task")result.completed=data.completed==="true";
 return result;
}
export function localDateTime(ms){
 const date=new Date(ms);
 if(!Number.isFinite(date.getTime()))return "";
 const p=n=>String(n).padStart(2,"0");
 return date.getFullYear()+"-"+p(date.getMonth()+1)+"-"+p(date.getDate())+"T"+p(date.getHours())+":"+p(date.getMinutes());
}
export function createWorkspaceUI({api,post,el,button,row,section,field,input,select,inlineForm,notify,account,currentPod}){
 const kinds=[["task","Tasks"],["resource","Resources"],["event","Calendar"],["flashcard","Flashcards"]];
 function bounded(name,placeholder,max,value="",required=true,type="text"){
  const i=input(name,placeholder,type);i.maxLength=max;i.value=value;i.required=required;return i;
 }
 function detailField(kind,item){
  const d=el("textarea");d.name="detail";d.maxLength=2000;d.required=kind==="flashcard";d.value=item?.detail??"";return field(kind==="flashcard"?"Answer":"Details (optional)",d);
 }
 function fields(kind,item=null){
  const result=[field(kind==="flashcard"?"Question":"Title",bounded("title","",120,item?.title??"")),detailField(kind,item)];
  if(kind==="resource")result.push(field("HTTPS resource link",bounded("url","https://",2048,item?.url??"",true,"url")));
  if(kind==="event")result.push(field("Event time (local)",bounded("starts","",100,item?localDateTime(item.startsMs):"",true,"datetime-local")));
  if(kind==="task"){
   const state=select("completed",[["false","To do"],["true","Done"]]);state.value=String(item?.completed??false);result.push(field("Status",state));
  }
  return result;
 }
 function canEdit(pod,item){return item.authorId===account()?.id||["owner","moderator"].includes(pod.role);}
 async function render(pod,target,kind="task"){
  if(currentPod()!==pod.id)return;
  const result=await api("/v1/pods/"+pod.id+"/workspace?kind="+kind);
  if(currentPod()!==pod.id||!target.isConnected)return;
  target.replaceChildren(el("h3","Pod workspace"),el("p","Only explicitly shared Pod items appear here. Removing or leaving the Pod removes your authored items.","muted"));
  const tabs=el("div",undefined,"room-controls");
  for(const [key,label] of kinds){
   const b=button(label,()=>render(pod,target,key),key===kind?"selected":"");b.setAttribute("aria-pressed",String(key===kind));tabs.append(b);
  }
  target.append(tabs);
  const list=el("div",undefined,"stack");
  for(const item of result.items){
   const card=el("article",undefined,"workspace-item"),heading=el("div",undefined,"section-head");
   heading.append(el("strong",item.title));
   if(item.kind==="task")heading.append(el("span",item.completed?"Done":"To do","chip"));
   if(item.kind==="event")heading.append(el("span",new Date(item.startsMs).toLocaleString(),"chip"));
   card.append(heading);
   if(item.kind==="flashcard"){
    const reveal=el("details");reveal.append(el("summary","Reveal answer"),el("p",item.detail));card.append(reveal);
   }else if(item.detail)card.append(el("p",item.detail,"muted"));
   if(item.kind==="resource"&&item.url){
    try{const u=new URL(item.url);if(u.protocol==="https:"&&!u.username&&!u.password){const link=el("a","Open external resource · "+u.hostname);link.href=u.href;link.target="_blank";link.rel="noopener noreferrer";card.append(link);}}catch{}
   }
   if(canEdit(pod,item)){
    const edit=el("details");edit.append(el("summary","Edit item"),inlineForm(fields(kind,item),"Save changes",async data=>{
     await api("/v1/pods/"+pod.id+"/workspace/"+item.id,{method:"PUT",data:{revision:item.revision,content:workspaceContent(kind,data)}});await render(pod,target,kind);
    }));
    edit.append(button("Delete item",async()=>{if(!confirm("Delete this shared item?"))return;await api("/v1/pods/"+pod.id+"/workspace/"+item.id,{method:"DELETE",data:{revision:item.revision}});await render(pod,target,kind);},"danger"));card.append(edit);
   }
   list.append(card);
  }
  if(!result.items.length)list.append(el("p","No shared "+kind+" items yet.","muted"));
  target.append(list);
  const add=el("details");add.append(el("summary","Add "+kind),inlineForm(fields(kind),"Create "+kind,async(data,f)=>{
   await post("/v1/pods/"+pod.id+"/workspace",workspaceContent(kind,data));f.reset();await render(pod,target,kind);
  }));target.append(add);
 }
 const utcDay=()=>new Date().toISOString().slice(0,10);
 async function progress(pod,target,day=utcDay()){
  const [data,challengeData]=await Promise.all([api("/v1/pods/"+pod.id+"/progress?day="+encodeURIComponent(day)),api("/v1/pods/"+pod.id+"/challenges")]);
  if(currentPod()!==pod.id||!target.isConnected)return;
  target.replaceChildren(el("h3","Shared progress"),el("p","Self-reported totals only. Nothing is imported automatically from your personal Track OS.","muted"));
  const dayInput=input("day","", "date");dayInput.value=day;dayInput.max=utcDay();
  target.append(inlineForm([field("UTC day",dayInput)],"View day",data=>progress(pod,target,data.day)));
  target.append(el("p",data.visibleTotalMinutes+" shared minutes · visible to you","chip"));
  for(const entry of data.entries)target.append(row(entry.displayName,entry.minutes+" min · "+entry.sessions+" sessions · self-reported"));
  if(!data.entries.length)target.append(el("p","No shared totals for this day.","muted"));
  const own=data.entries.find(e=>e.accountId===account()?.id);
  const minutes=input("minutes","","number");minutes.min="0";minutes.max="1440";minutes.step="1";minutes.value=String(own?.minutes??0);
  const sessions=input("sessions","","number");sessions.min="0";sessions.max="100";sessions.step="1";sessions.value=String(own?.sessions??0);
  target.append(inlineForm([field("My focus minutes",minutes),field("My session count",sessions)],"Publish to this Pod",async values=>{
   if(!confirm("Share these self-reported totals for "+day+" with this Pod?"))return;
   await post("/v1/pods/"+pod.id+"/progress",{day,minutes:Number(values.minutes),sessions:Number(values.sessions)});await progress(pod,target,day);
  }));
  if(own)target.append(button("Revoke my shared totals",async()=>{await api("/v1/pods/"+pod.id+"/progress/"+day,{method:"DELETE"});await progress(pod,target,day);},"danger"));
  const challenges=section("Cooperative challenges");
  for(const c of challengeData.challenges)challenges.append(row(c.title,c.startDay+" – "+c.endDay+" · "+c.visibleSharedMinutes+"/"+c.teamTargetMinutes+" min shared · "+c.visibleParticipants+" visible participants",[button(c.joined?"Leave challenge":"Join challenge",async()=>{
   await post("/v1/pods/"+pod.id+"/challenges/"+c.id,{joined:!c.joined});await progress(pod,target,day);
  })]));
  if(!challengeData.challenges.length)challenges.append(el("p","No team challenges yet.","muted"));
  if(["owner","moderator"].includes(pod.role)){
   const name=bounded("title","Study together",80),start=input("startDay","","date"),end=input("endDay","","date"),goal=input("teamTargetMinutes","","number");
   start.value=utcDay();end.value=utcDay();goal.min="10";goal.max="10000";goal.value="300";
   challenges.append(inlineForm([field("Team challenge",name),field("Start UTC day",start),field("End UTC day",end),field("Team target minutes",goal)],"Create challenge",async values=>{
    await post("/v1/pods/"+pod.id+"/challenges",{...values,teamTargetMinutes:Number(values.teamTargetMinutes)});await progress(pod,target,day);
   }));
  }
  target.append(challenges);
 }
 return {render,progress};
}
