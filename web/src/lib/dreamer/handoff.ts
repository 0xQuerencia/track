import {z} from "zod";
import {addDays} from "../dates";
import type {ActionDraft} from "./action-approvals";
import type {Artifact} from "./artifacts";
const email=z.string().trim().max(254).regex(/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/);
export const emailDraftInput=z.object({to:email,subject:z.string().trim().min(1).max(180).refine(v=>!/[\r\n\x00-\x1f\x7f]/.test(v)),body:z.string().min(1).max(12000)}).strict();
export type EmailDraftInput=z.infer<typeof emailDraftInput>;
/** RFC 5545 text escaping and octet-aware line folding. No property values become headers. */
function escapeICal(s:string){return s.replace(/\\/g,"\\\\").replace(/\r\n|\r|\n/g,"\\n").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,"");}
function fold(line:string){let result="",part="";for(const c of line){if(Buffer.byteLength(part+c)>75){result+=part+"\r\n";part=" ";}part+=c;}return result+part;}
const icalDate=(day:string)=>day.replaceAll("-","");
const icalTime=(day:string,time:string)=>icalDate(day)+"T"+time.replace(":","")+"00";
export function calendarDraft(draft:ActionDraft):Artifact{
 if(draft.state!=="applied"||draft.input.tool!=="track.create_event"||!draft.receipt?.recordId||!/^[a-f0-9]{64}$/.test(draft.id)||draft.handledMs===null)throw Error("An applied event receipt is required");
 const p=draft.input.params,stamp=new Date(draft.handledMs).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
 const dates=p.start_time?["DTSTART:"+icalTime(p.date,p.start_time),...(p.end_time?["DTEND:"+icalTime(p.date,p.end_time)]:[])]:["DTSTART;VALUE=DATE:"+icalDate(p.date),"DTEND;VALUE=DATE:"+icalDate(addDays(p.date,1))];
 const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Track//Dreamer local handoff//EN","CALSCALE:GREGORIAN","BEGIN:VEVENT","UID:"+draft.id+"@track.local","DTSTAMP:"+stamp,...dates,"SUMMARY:"+escapeICal(p.title),...(p.notes?["DESCRIPTION:"+escapeICal(p.notes)]:[]),"STATUS:CONFIRMED","END:VEVENT","END:VCALENDAR"];
 return {filename:"track-event-"+draft.id.slice(0,12)+".ics",contentType:"text/calendar; charset=utf-8",body:lines.map(fold).join("\r\n")+"\r\n"};
}
function subjectWords(subject:string){
 let chunk="";const parts:string[]=[];
 for(const c of subject){if(Buffer.byteLength(chunk+c)>36){parts.push(chunk);chunk="";}chunk+=c;}if(chunk)parts.push(chunk);
 return parts.map(p=>"=?UTF-8?B?"+Buffer.from(p).toString("base64")+"?=").join("\r\n ");
}
/** An unsent local MIME message. No mail transport, cookies, account or delivery. */
export function emailDraft(input:unknown):Artifact{
 const p=emailDraftInput.parse(input);
 const encoded=Buffer.from(p.body.replace(/\r\n|\r|\n/g,"\r\n"),"utf8").toString("base64");
 const body=["X-Unsent: 1","To: "+p.to,"Subject: "+subjectWords(p.subject),"MIME-Version: 1.0","Content-Type: text/plain; charset=UTF-8","Content-Transfer-Encoding: base64","",...(encoded.match(/.{1,76}/g)??[])].join("\r\n")+"\r\n";
 return {filename:"dreamer-unsent.eml",contentType:"message/rfc822",body};
}
