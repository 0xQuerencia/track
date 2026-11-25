import {createServer} from "node:http";
import {pathToFileURL} from "node:url";
import {openSocialDb} from "./db.mjs";
import {HttpError,respond,limiter} from "./http.mjs";
export function socialConfig(env=process.env){
  if(env.TRACK_SOCIAL_ENABLED!=="1")throw new Error("Social is disabled; explicitly set TRACK_SOCIAL_ENABLED=1");
  if(!env.TRACK_SOCIAL_DATA)throw new Error("Dedicated social data directory required");
  const port=Number(env.TRACK_SOCIAL_PORT??8788);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid social port");
  return {directory:env.TRACK_SOCIAL_DATA,host:"127.0.0.1",port};
}
/** No routes, database connections, cookies, or credentials are shared with the personal OS. */
export function makeServer(db,{routes=async()=>false}={}){
  const allow=limiter({max:120,windowMs:60000});
  const server=createServer({requestTimeout:15000,headersTimeout:10000,maxHeaderSize:8192},async(req,res)=>{
    try{
      if(!allow(req.socket.remoteAddress??"unknown"))throw new HttpError(429,"Rate limited");
      if(req.headers.origin)throw new HttpError(403,"Cross-origin browser requests are disabled");
      const url=new URL(req.url??"/","http://localhost");
      if(url.pathname==="/healthz"&&req.method==="GET"){respond(res,200,{ok:true,service:"track-social"});return;}
      if(await routes({db,req,res,url}))return;
      throw new HttpError(404,"Not found");
    }catch(e){
      if(res.headersSent){res.end();return;}
      respond(res,e instanceof HttpError?e.status:500,{ok:false,error:e instanceof HttpError?e.message:"Internal error"});
    }
  });
  server.maxConnections=100;
  return server;
}
export function main(env=process.env){
  const config=socialConfig(env),db=openSocialDb(config.directory),server=makeServer(db);
  server.listen(config.port,config.host,()=>console.log("Track Social listening on loopback"));
  const stop=()=>server.close(()=>db.close());
  process.once("SIGTERM",stop);process.once("SIGINT",stop);
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
