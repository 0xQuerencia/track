import assert from "node:assert/strict";
import {chromium} from "playwright";
import {memoryDb} from "../src/db.mjs";
import {createAccountInvite} from "../src/identity.mjs";
import {makeServer} from "../src/server.mjs";
const db=memoryDb(),origin="http://127.0.0.1:8788",server=makeServer(db,{origin});
const wait={timeout:25000};
let browser;
const failures=[];
async function register(page,handle,name){
 await page.goto(origin);
 const form=page.locator("#register");
 await form.getByLabel("Account invitation").fill(createAccountInvite(db).invite);
 await form.getByLabel("Handle",{exact:true}).fill(handle);
 await form.getByLabel("Display name").fill(name);
 await form.getByLabel("New password (12+ UTF-8 bytes)").fill("dev-only-long-test-password-"+handle);
 await form.getByRole("button",{name:"Create account",exact:true}).click();
 await page.locator("#dashboard").waitFor(wait);
 assert.equal(await page.locator("#identity").textContent(),"@"+handle);
}
async function refresh(page){await page.locator("#refresh").click();}
try{
 await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(8788,"127.0.0.1",resolve);});
 browser=await chromium.launch({headless:true});
 const contextA=await browser.newContext({viewport:{width:1280,height:900}}),contextB=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const a=await contextA.newPage(),b=await contextB.newPage();
 for(const page of [a,b]){
   page.on("pageerror",e=>failures.push(e.message));
   page.on("dialog",d=>void d.accept());
 }
 await register(a,"alice","Alice");await register(b,"bob","Bob");
 const request=a.locator("#friend-request");
 await request.getByLabel("Exact handle").fill("bob");await request.getByRole("button",{name:"Send request"}).click();
 await a.locator("#friends").getByText("@bob · outgoing",{exact:true}).waitFor(wait);
 await refresh(b);await b.locator("#friends").getByRole("button",{name:"Accept",exact:true}).click();
 await b.locator("#friends").getByText("@alice · accepted",{exact:true}).waitFor(wait);
 await refresh(a);await a.locator("#friends").getByText("@bob · accepted",{exact:true}).waitFor(wait);
 const create=a.locator("#create-pod");await create.getByLabel("New Pod").fill("Evening study");await create.getByRole("button",{name:"Create Pod"}).click();
 await a.locator("#pod-view").getByRole("heading",{name:"Evening study",exact:true}).waitFor(wait);
 await a.locator("#pod-view").getByLabel("Invite a friend").selectOption({label:"Bob (@bob)"});
 await a.locator("#pod-view").getByRole("button",{name:"Create one-time invitation"}).click();
 const code=a.getByLabel("One-time invitation code");await code.waitFor(wait);
 await b.locator("#join-pod").getByLabel("Pod invitation").fill(await code.inputValue());await b.locator("#join-pod").getByRole("button",{name:"Join Pod"}).click();
 await b.locator("#pod-view").getByRole("heading",{name:"Evening study",exact:true}).waitFor(wait);
 // A shared workspace task is visible across independent accounts.
 const ws=a.locator("#pod-view .subsection").filter({has:a.getByRole("heading",{name:"Pod workspace",exact:true})});
 await ws.getByText("Add task",{exact:true}).click();
 await ws.getByLabel("Title",{exact:true}).fill("Practice calculus");
 await ws.getByRole("button",{name:"Create task",exact:true}).click();
 await ws.getByText("Practice calculus",{exact:true}).waitFor(wait);
 await refresh(b);await b.locator("#pod-view").getByText("Practice calculus",{exact:true}).waitFor(wait);
 // Create a room, join from a mobile viewport, chat, ready up and run together.
 await a.locator("#pod-view").getByLabel("Shared objective").fill("Calculus sprint");
 await a.locator("#pod-view").getByRole("button",{name:"Create room",exact:true}).click();
 await a.locator("#room-view").getByRole("heading",{name:"Calculus sprint",exact:true}).waitFor(wait);
 await refresh(b);
 await b.locator("#pod-view").getByRole("button",{name:"Open room",exact:true}).click();
 const ar=a.locator("#room-view"),br=b.locator("#room-view");
 await br.getByRole("button",{name:"Join room",exact:true}).click();
 await br.getByLabel("Message",{exact:true}).fill("Ready for calculus!");
 await br.getByRole("button",{name:"Send",exact:true}).click();
 await ar.getByText("Ready for calculus!",{exact:true}).waitFor(wait);
 await ar.getByRole("button",{name:"Ready",exact:true}).click();
 await br.getByRole("button",{name:"Ready",exact:true}).click();
 await ar.getByRole("button",{name:"Start together",exact:true}).click(wait);
 await br.getByText("Focus · Round 1/4",{exact:true}).waitFor(wait);
 await br.getByRole("button",{name:"Personal pause",exact:true}).click();
 await br.getByRole("button",{name:"Resume personally",exact:true}).waitFor(wait);
 await ar.getByRole("button",{name:"Pause group",exact:true}).click();
 await br.getByText("Focus · Room paused · Round 1/4",{exact:true}).waitFor(wait);
 await ar.getByRole("button",{name:"Resume group",exact:true}).click();
 await br.getByText("Focus · Round 1/4",{exact:true}).waitFor(wait);
 await ar.getByRole("button",{name:"End room",exact:true}).click();
 await br.getByText("Room ended",{exact:true}).waitFor(wait);
 assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 assert.deepEqual(failures,[]);
 console.log("Two independent browser contexts completed the invite, Pod, workspace, chat and synchronized room flow.");
}catch(e){
 console.error("Social browser flow failed:",e.message);
 if(browser)for(const [i,context] of browser.contexts().entries())for(const page of context.pages()){
  try{console.error("Context",i,"notice:",await page.locator("#notice").textContent());}catch{}
 }
 process.exitCode=1;
}finally{
 await browser?.close();
 server.closeAllConnections();
 await new Promise(resolve=>server.close(resolve));db.close();
}
