import {test} from "node:test";
import assert from "node:assert/strict";
import {focusLease,MAX_LEASE_MS} from "./focus-policy.mjs";
const t=1800000000000,active={ok:true,active:true,phase:"focus",paused:false,remainingMs:120000};
test("short renewable leases only during active focus",()=>{
  assert.equal(focusLease(active,t,100),t+MAX_LEASE_MS);
  assert.equal(focusLease({...active,remainingMs:10000},t,500),t+9500);
  for(const s of [null,{}, {...active,paused:true},{...active,phase:"short_break"},{...active,active:false},{...active,remainingMs:100}])assert.equal(focusLease(s,t,200),0);
  assert.equal(focusLease(active,t,10001),0);
});
