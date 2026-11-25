import {openSocialDb} from "./db.mjs";
import {createAccountInvite} from "./identity.mjs";
import {socialConfig} from "./server.mjs";
try{
 const db=openSocialDb(socialConfig().directory);
 try{console.log(JSON.stringify(createAccountInvite(db)));}finally{db.close();}
}catch(e){console.error(e.message);process.exitCode=1;}
