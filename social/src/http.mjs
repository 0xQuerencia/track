export class HttpError extends Error{
  constructor(status,message){super(message);this.status=status;}
}
export function respond(res,status,data){
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; frame-ancestors 'none'","referrer-policy":"no-referrer"});
  res.end(JSON.stringify(data));
}
export async function readJson(req,max=8192){
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"]??""))throw new HttpError(415,"JSON required");
  const length=Number(req.headers["content-length"]??0);
  if(!Number.isFinite(length)||length>max)throw new HttpError(413,"Body too large");
  let total=0;const chunks=[];
  for await(const chunk of req){
    total+=chunk.length;if(total>max)throw new HttpError(413,"Body too large");chunks.push(chunk);
  }
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new HttpError(400,"Invalid JSON");}
  if(!body||typeof body!=="object"||Array.isArray(body))throw new HttpError(400,"JSON object required");
  return body;
}
export function exact(body,keys){
  if(Object.keys(body).some(k=>!keys.includes(k)))throw new HttpError(400,"Unexpected field");
  return body;
}
export function textField(value,min,max){
  if(typeof value!=="string"||value.trim().length<min||value.trim().length>max||/[\u0000-\u001f\u007f]/.test(value))throw new HttpError(400,"Invalid text field");
  return value.trim();
}
export function limiter({max=120,windowMs=60000,maxKeys=10000}={}){
  const buckets=new Map();
  return (key,now=Date.now())=>{
    const old=buckets.get(key);
    if(old&&old.until>now){if(old.count>=max)return false;old.count++;return true;}
    if(buckets.size>=maxKeys){
      for(const [k,v] of buckets)if(v.until<=now)buckets.delete(k);
      if(buckets.size>=maxKeys)return false;
    }
    buckets.set(key,{count:1,until:now+windowMs});return true;
  };
}
