export const MAX_GAP=90000,MAX_QUEUE=2880,RETENTION_MS=30*86400000;
export function sampleInterval(previous,now,observation,makeId){
  if(!Number.isSafeInteger(now)||now<0)throw new RangeError("Invalid time");
  const last=observation?{at:now,category:observation.category??null}:null;
  if(!previous||!observation||!Number.isSafeInteger(previous.at)||now<=previous.at||now-previous.at>MAX_GAP||previous.category!==last.category)return {last,event:null};
  return {last,event:{eventId:makeId(),source:"browser",startMs:previous.at,endMs:now,...(last.category?{category:last.category}:{})}};
}
export function appendQueue(queue,event,dropped=0){
  const next=event?[...queue,event]:[...queue];
  const overflow=Math.max(0,next.length-MAX_QUEUE);
  return {queue:next.slice(overflow),dropped:dropped+overflow};
}
export function pruneQueue(queue,now,dropped=0){
  const next=queue.filter(e=>Number.isSafeInteger(e.startMs)&&e.startMs>=now-RETENTION_MS);
  return {queue:next,dropped:dropped+queue.length-next.length};
}
export function acceptAck(queue,batch,ack){
  if(!Array.isArray(ack)||ack.some(id=>typeof id!=="string"))throw new Error("Invalid acknowledgment");
  const sent=new Set(batch.map(e=>e.eventId)),got=new Set(ack);
  if(got.size!==sent.size||[...got].some(id=>!sent.has(id)))throw new Error("Incomplete or unexpected acknowledgment");
  return queue.filter(e=>!got.has(e.eventId));
}
export function backoffMs(failures){return Math.min(15*60000,30000*2**Math.min(5,Math.max(0,failures-1)));}
