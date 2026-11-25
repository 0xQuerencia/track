import assert from "node:assert/strict";
import {test} from "node:test";
import {parseCommand} from "./commands";
import {DEFAULT_POMODORO} from "./clock";
test("parses only explicitly allowed command shapes",()=>{
  assert.deepEqual(parseCommand({command:"pause",id:"a",revision:0}),{command:"pause",id:"a",revision:0});
  assert.equal(parseCommand({command:"pause",id:"a",revision:0,owner:"friend"}),null);
  assert.equal(parseCommand({command:"pause",id:"a",revision:-1}),null);
  assert.equal(parseCommand({command:"delete",id:"a",revision:0}),null);
});
test("requires bounded numerical configuration without client clock",()=>{
  assert.ok(parseCommand({command:"start",id:"a",label:"Study",config:DEFAULT_POMODORO}));
  assert.equal(parseCommand({command:"start",id:"a",label:"Study",config:{...DEFAULT_POMODORO,rounds:100}}),null);
  assert.equal(parseCommand({command:"start",id:"a",label:"Study",config:DEFAULT_POMODORO,startedAt:123}),null);
});
