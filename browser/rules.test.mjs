import {test} from "node:test";
import assert from "node:assert/strict";
import {classifyUrl,parseRuleText,validateRules} from "./rules.mjs";
test("local rules exclude first and only send coarse category",()=>{
  const {rules,excluded}=parseRuleText("example.com,Media\nstudy.example.com,Study","private.example.com");
  assert.deepEqual(classifyUrl("https://study.example.com/path?secret=x",rules,excluded),{category:"Study"});
  assert.deepEqual(classifyUrl("https://badexample.com/",rules,excluded),{category:"Other"});
  assert.equal(classifyUrl("https://private.example.com/",rules,excluded),null);
  assert.equal(classifyUrl("https://127.0.0.1/",rules,excluded),null);
  assert.throws(()=>validateRules([{suffix:"https://a.com",category:"Study"}],[]));
});
