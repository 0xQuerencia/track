import assert from "node:assert/strict";
import {test} from "node:test";
import {domainOnly,classifyDomain,type Rule} from "./classification";
test("strip path, query and fragment; exclude local and literal IP hosts",()=>{
  assert.equal(domainOnly("https://Study.example.com/private?q=secret#frag"),"study.example.com");
  for(const u of ["file:///tmp/private","chrome://settings","https://127.0.0.1/a","https://foo.local/a","https://localhost/a","https://user:pass@example.com"])assert.equal(domainOnly(u),null);
});
test("longest suffix wins, exclusion has priority, suffix is label bounded",()=>{
  const rules:Rule[]=[{suffix:"example.com",category:"Other"},{suffix:"study.example.com",category:"Study",project:"Physics"}];
  assert.deepEqual(classifyDomain("study.example.com",rules),{category:"Study",project:"Physics"});
  assert.deepEqual(classifyDomain("evil-example.com",rules),{category:"Other",project:null});
  assert.equal(classifyDomain("study.example.com",rules,["example.com"]),null);
});
