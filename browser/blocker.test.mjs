import {test} from "node:test";
import assert from "node:assert/strict";
import {blockConfig,isBlockRule} from "./blocker.mjs";
test("only explicit domains, duration cap and top-level navigation rules",()=>{
 const c=blockConfig(["Example.com","example.com"],25,"https://track.other.com");
 assert.deepEqual(c.domains,["example.com"]);assert.equal(c.rules.length,1);
 assert.deepEqual(c.rules[0].condition.resourceTypes,["main_frame"]);
 assert.equal(isBlockRule(c.rules[0].id),true);assert.equal(isBlockRule(1),false);
 assert.throws(()=>blockConfig(["other.com"],25,"https://track.other.com"),/cannot be blocked/);
 assert.throws(()=>blockConfig(["example.com/path"],25,""),/domains/);
 assert.throws(()=>blockConfig(["example.com"],500,""),/minutes/);
});
