export const CATEGORIES=["Study","Coding","Media","Social","Games","Other"];
export function domainOnly(raw){
  try{
    const u=new URL(raw);
    if(!["http:","https:"].includes(u.protocol)||u.username||u.password)return null;
    const host=u.hostname.toLowerCase().replace(/\.$/,"");
    if(host.length>253||!host.includes(".")||!host.split(".").every(x=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x)))return null;
    if(/^\d+(\.\d+){3}$/.test(host)||host.endsWith(".local")||host.endsWith(".internal"))return null;
    return host;
  }catch{return null;}
}
const validHost=host=>typeof host==="string"&&domainOnly("https://"+host)===host;
const matches=(host,suffix)=>host===suffix||host.endsWith("."+suffix);
export function validateRules(rules,excluded){
  if(!Array.isArray(rules)||!Array.isArray(excluded)||rules.length>100||excluded.length>100)throw new Error("At most 100 rules and 100 exclusions.");
  if(rules.some(r=>!r||!validHost(r.suffix)||!CATEGORIES.includes(r.category))||excluded.some(h=>!validHost(h)))throw new Error("Use lower-case domain names and supported categories.");
  if(new Set(rules.map(r=>r.suffix)).size!==rules.length)throw new Error("Duplicate rule domains.");
  return {rules:rules.map(r=>({suffix:r.suffix,category:r.category})),excluded:[...new Set(excluded)]};
}
export function classifyUrl(url,rules,excluded){
  const host=domainOnly(url);
  if(!host||excluded.some(s=>matches(host,s)))return null;
  const hit=rules.filter(r=>matches(host,r.suffix)).sort((a,b)=>b.suffix.length-a.suffix.length)[0];
  return {category:hit?.category??"Other"};
}
export function parseRuleText(text,exclusions){
  const rules=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{
    const parts=line.split(",").map(x=>x.trim());
    if(parts.length!==2)throw new Error("Each rule must be domain,Category.");
    return {suffix:parts[0].toLowerCase(),category:parts[1]};
  });
  return validateRules(rules,exclusions.split(/\r?\n/).map(x=>x.trim().toLowerCase()).filter(Boolean));
}
