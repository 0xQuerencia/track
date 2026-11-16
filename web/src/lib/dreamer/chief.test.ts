import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { setConsent, type ChatJsonRequest } from "@/lib/ai";
import { runMigrations } from "@/lib/migrations";
import { runChiefMission, listChiefMessages, type AiCaller } from "./chief";

test("Chief delegates real, separate specialist calls, including strategy and critique, then synthesizes", async () => {
  const previousKey=process.env.AI_API_KEY;
  const db=new DatabaseSync(":memory:");
  try {
    process.env.AI_API_KEY="test-never-used-for-network";
    db.exec("PRAGMA foreign_keys=ON");
    runMigrations(db,{backup:false});
    setConsent(db,"dreamer",true);
    const purposes:string[]=[];
    const disclosures:string[]=[];
    const fake:AiCaller=async <T>(request:ChatJsonRequest<T>)=>{
      purposes.push(request.purpose);
      disclosures.push(JSON.stringify(request.messages));
      const value = request.purpose === "Chief mission synthesis"
        ? {answer:"## Project plan\nA grounded product idea with milestones, validation and risks."}
        : {report:"This agent produced a separate grounded analysis and actionable considerations."};
      return {ok:true,data:request.schema.parse(value),model:"test-stub",usage:{promptTokens:10,completionTokens:20}};
    };
    const result=await runChiefMission(db,"Build a product idea for a useful local workflow",{includeContext:false},fake);
    assert.equal(result.ok,true);
    assert.equal(purposes.at(-1),"Chief mission synthesis");
    assert.deepEqual(
      (db.prepare("SELECT agent_key FROM dreamer_agent_steps ORDER BY id").all() as {agent_key:string}[]).map((row)=>row.agent_key),
      ["inventor","researcher","strategist","critic"],
    );
    assert.equal(listChiefMessages(db).length,2);
    assert.match(listChiefMessages(db)[1].text,/Project plan/);
    assert.equal((db.prepare("SELECT state FROM dreamer_missions LIMIT 1").get() as {state:string}).state,"complete");
    assert.ok(disclosures.every((item)=>item.includes("optionalTrackContext")));
    assert.ok(disclosures.every((item)=>!item.includes("secret private journal text")));
  } finally {
    db.close();
    if(previousKey===undefined)delete process.env.AI_API_KEY;else process.env.AI_API_KEY=previousKey;
  }
});

test("Chief refuses model delegation without Dreamer consent",async()=>{
  const db=new DatabaseSync(":memory:");
  try {
    runMigrations(db,{backup:false});
    let called=false;
    const fake:AiCaller=async<T>(request:ChatJsonRequest<T>)=>{
      called=true;
      return {ok:true,data:request.schema.parse({report:"invalid"}),model:"test-stub",usage:{promptTokens:null,completionTokens:null}};
    };
    const result=await runChiefMission(db,"Please evaluate my idea",{},fake);
    assert.equal(result.ok,false);
    assert.equal(called,false);
    assert.match(result.message,/consent/i);
  }finally{db.close();}
});

