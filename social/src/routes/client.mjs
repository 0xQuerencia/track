import {readFileSync} from "node:fs";
const assets=new Map([
 ["/",["index.html","text/html; charset=utf-8"]],
 ["/app.mjs",["app.mjs","text/javascript; charset=utf-8"]],
 ["/room-ui.mjs",["room-ui.mjs","text/javascript; charset=utf-8"]],
 ["/room-time.mjs",["room-time.mjs","text/javascript; charset=utf-8"]],
 ["/styles.css",["styles.css","text/css; charset=utf-8"]]
]);
export function parseClientOrigin(raw){
 if(!raw)return null;
 let u;try{u=new URL(raw);}catch{throw new Error("Invalid TRACK_SOCIAL_ORIGIN");}
 if((u.protocol!=="https:"&&!(u.protocol==="http:"&&["127.0.0.1","localhost"].includes(u.hostname)))||u.username||u.password||u.pathname!=="/"||u.search||u.hash)throw new Error("Use a dedicated HTTPS origin (HTTP only for loopback development)");
 return u.origin;
}
export function clientRoute({req,res,url}){
 if(req.method!=="GET"||!assets.has(url.pathname))return false;
 const [file,type]=assets.get(url.pathname);
 const data=readFileSync(new URL("../../public/"+file,import.meta.url));
 res.writeHead(200,{"content-type":type,"content-length":data.length,"cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'","referrer-policy":"no-referrer","permissions-policy":"camera=(), microphone=(), geolocation=()"});
 res.end(data);return true;
}
