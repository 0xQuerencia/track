export function remainingAt(snapshot,receivedAt,now){
 if(!snapshot||!Number.isFinite(snapshot.remainingMs))return null;
 if(snapshot.paused||snapshot.phase==="complete"||snapshot.phase==="ended")return Math.max(0,snapshot.remainingMs);
 return Math.max(0,snapshot.remainingMs-Math.max(0,now-receivedAt));
}
export function formatRemaining(ms){
 if(ms===null)return "—";
 const seconds=Math.max(0,Math.ceil(ms/1000));
 return String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
}
export function phaseLabel(phase){
 return ({waiting:"Lobby",focus:"Focus",short_break:"Short break",long_break:"Long break",complete:"Timer complete",ended:"Room ended"})[phase]??"Unknown";
}
