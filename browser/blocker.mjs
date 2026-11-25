import {domainOnly} from "./rules.mjs";
export const BLOCK_ALARM="pulse-block-expiry",RULE_BASE=7000,MAX_DOMAINS=40;
export function blockConfig(rawDomains,minutes,server){
  if(!Array.isArray(rawDomains)||rawDomains.length<1||rawDomains.length>MAX_DOMAINS||!Number.isInteger(minutes)||minutes<1||minutes>180)throw new Error("Choose 1–40 domains and 1–180 minutes.");
  const domains=[...new Set(rawDomains.map(d=>String(d).trim().toLowerCase()))];
  if(domains.some(d=>domainOnly("https://"+d)!==d))throw new Error("Enter domains without a URL, port, or path.");
  if(server){
    const host=new URL(server).hostname;
    if(domains.some(d=>host===d||host.endsWith("."+d)))throw new Error("Your Track server cannot be blocked.");
  }
  const origins=domains.flatMap(d=>["https://*."+d+"/*","http://*."+d+"/*"]);
  const rules=domains.map((d,i)=>({id:RULE_BASE+i,priority:1,action:{type:"block"},condition:{requestDomains:[d],resourceTypes:["main_frame"]}}));
  return {domains,minutes,origins,rules};
}
export function isBlockRule(id){return Number.isInteger(id)&&id>=RULE_BASE&&id<RULE_BASE+MAX_DOMAINS;}
