import assert from "node:assert/strict";
import {test} from "node:test";
import {DatabaseSync} from "node:sqlite";
import {migration} from "../migrations/m170_pulse";
import {migration as categories} from "../migrations/m172_pulse_categories";
import {migration as privacy} from "../migrations/m171_pulse_privacy";
import {ingestActivity} from "./store";
import {activityAnalytics,activityDay,localDayStart,dayWindows} from "./analytics";
test("calendar boundaries handle DST and half-hour zones",()=>{
 const day=86400000;
 assert.equal(localDayStart("2026-03-09","America/New_York")-localDayStart("2026-03-08","America/New_York"),day-3600000);
 assert.equal(localDayStart("2026-11-02","America/New_York")-localDayStart("2026-11-01","America/New_York"),day+3600000);
 assert.equal(new Date(localDayStart("2026-11-26","Asia/Kolkata")).toISOString(),"2026-11-25T18:30:00.000Z");
 const now=Date.parse("2026-11-26T12:00:00Z"),windows=dayWindows(now,"Asia/Kolkata",30);
 assert.equal(windows.length,30);assert.equal(windows.at(-1)?.endMs,now);
 assert.ok(windows[0].startMs>=now-30*day);
});
test("daily and hourly reports conserve observed and unknown time without double counting",()=>{
 const db=new DatabaseSync(":memory:");
 try{
 db.exec("CREATE TABLE integration_tokens(id INTEGER PRIMARY KEY); INSERT INTO integration_tokens VALUES(1),(2)");migration.up(db);privacy.up(db);categories.up(db);
 const now=Date.parse("2026-11-26T02:00:00Z"),a={eventId:"a",source:"browser",startMs:now-5400000,endMs:now-1800000,category:"Study"};
 assert.equal(ingestActivity(db,1,[a],now).ok,true);assert.equal(ingestActivity(db,2,[{...a,category:"Coding"}],now).ok,true);
 const report=activityAnalytics(db,now,"UTC",7),today=report.days.at(-1)!;
 assert.equal(today.observedMs,3600000);assert.equal(today.deviceMs,7200000);assert.equal(today.categoryMs.Mixed,3600000);assert.equal(today.unknownMs,3600000);
 const detail=activityDay(db,"2026-11-26",now,"UTC");
 assert.equal(detail.bins.length,2);assert.equal(detail.bins.reduce((n,b)=>n+b.observedMs,0),today.observedMs);
 assert.equal(report.days[0].observedMs,0);assert.ok(report.days[0].unknownMs>0);
 assert.throws(()=>activityDay(db,"2026-11-27",now,"UTC"),/Invalid activity date/);
 }finally{db.close();}
});
