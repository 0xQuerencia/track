import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {manifestFor} from "./build.mjs";
test("Firefox uses MV3 event page, Chromium uses service worker; privacy scope unchanged",async()=>{
 const source=JSON.parse(await fs.readFile(new URL("./manifest.json",import.meta.url),"utf8"));
 const firefox=manifestFor(source,"firefox"),chrome=manifestFor(source,"chromium");
 assert.deepEqual(firefox.background,{scripts:["worker.js"],type:"module",persistent:false});
 assert.equal(chrome.background.service_worker,"worker.js");
 assert.equal(firefox.incognito,"not_allowed");
 assert.deepEqual(firefox.optional_permissions,source.optional_permissions);
 assert.deepEqual(firefox.optional_host_permissions,source.optional_host_permissions);
 assert.equal(firefox.minimum_chrome_version,undefined);
 assert.equal(source.background.service_worker,"worker.js");
 assert.throws(()=>manifestFor(source,"other"));
});
