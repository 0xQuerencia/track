import {test} from "node:test";
import assert from "node:assert/strict";
import {request} from "node:http";
import {memoryDb} from "../src/db.mjs";
import {makeServer} from "../src/server.mjs";
import {parseClientOrigin} from "../src/routes/client.mjs";
const origin="https://social.example.test";
test("origin validation requires HTTPS outside loopback",()=>{
 assert.equal(parseClientOrigin("http://127.0.0.1:8788"),"http://127.0.0.1:8788");
 assert.equal(parseClientOrigin(origin),origin);
 for(const value of ["http://example.com","https://example.com/path","https://user@example.com","https://example.com/?q=1"])assert.throws(()=>parseClientOrigin(value));
});
test("client disabled by default, strict host/origin and only fixed assets",async()=>{
 const db=memoryDb(),server=makeServer(db,{origin});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const req=(path,{host="social.example.test",from,method="GET"}={})=>new Promise((resolve,reject)=>{
  const r=request({host:"127.0.0.1",port:server.address().port,path,method,headers:{host,...(from?{origin:from}:{})}},res=>{let body="";res.on("data",c=>body+=c);res.on("end",()=>resolve({status:res.statusCode,headers:res.headers,body}));});r.on("error",reject);r.end();
 });
 try{
  const home=await req("/");assert.equal(home.status,200);assert.match(home.body,/Track Social/);assert.match(home.headers["content-security-policy"],/script-src 'self'/);assert.equal(home.headers["set-cookie"],undefined);
  assert.equal((await req("/app.mjs")).status,200);
  assert.equal((await req("/src/db.mjs")).status,404);
  assert.equal((await req("/",{host:"evil.test"})).status,403);
  assert.equal((await req("/v1/me",{from:"https://evil.test"})).status,403);
  assert.equal((await req("/v1/me",{from:origin})).status,401);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();}
});
