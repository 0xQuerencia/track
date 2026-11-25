import {openSocialDb} from "./db.mjs";
import {socialConfig} from "./server.mjs";
import {pruneSocial,backupSocial} from "./maintenance.mjs";
import {listReports,showReport,resolveReport} from "./moderation.mjs";
try{
 const config=socialConfig(),args=process.argv.slice(2);
 const supported=args[0]==="maintenance"&&(args.length===1||args.length===2&&args[1]==="--apply")||args[0]==="backup"&&args.length===1||args[0]==="reports"&&(args.length===2&&args[1]==="list"||args.length===3&&["show","resolve"].includes(args[1]));
 if(!supported)throw new Error("Usage: admin.mjs maintenance [--apply] | backup | reports list | reports show ID | reports resolve ID");
 const db=openSocialDb(config.directory);
 try{
  let result;
  if(args[0]==="maintenance")result=pruneSocial(db,{dryRun:args[1]!=="--apply"});
  else if(args[0]==="backup")result={path:backupSocial(db,config.directory)};
  else if(args[1]==="list")result=listReports(db);
  else if(args[1]==="show")result=showReport(db,args[2]);
  else result={resolved:resolveReport(db,args[2])};
  console.log(JSON.stringify(result,null,2));
 }finally{db.close();}
}catch(e){console.error(e.message);process.exitCode=1;}
