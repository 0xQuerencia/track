export const CATEGORIES=["Study","Coding","Media","Social","Games","Other"] as const;
export type Category=(typeof CATEGORIES)[number];
export type Rule=Readonly<{suffix:string;category:Category;project?:string}>;
/** Normalize locally observed host names without ever retaining URL paths. */
export function domainOnly(raw:string):string|null{
  try{
    const u=new URL(raw);
    if(u.protocol!=="http:"&&u.protocol!=="https:"||u.username||u.password)return null;
    const host=u.hostname.toLowerCase().replace(/\.$/,"");
    if(host.length>253||!host.includes(".")||!host.split(".").every(x=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x)))return null;
    // Do not retain literal IPv4/IPv6 or intranet host names.
    if(/^\d+(\.\d+){3}$/.test(host)||host.endsWith(".local")||host.endsWith(".internal"))return null;
    return host;
  }catch{return null;}
}
export function matchesSuffix(host:string,suffix:string){
  return host===suffix||host.endsWith("."+suffix);
}
export function classifyDomain(host:string,rules:readonly Rule[],excluded:readonly string[]=[]):{category:Category;project:string|null}|null{
  if(domainOnly("https://"+host)!==host||excluded.some(s=>matchesSuffix(host,s)))return null;
  const ordered=rules.filter(r=>domainOnly("https://"+r.suffix)===r.suffix&&CATEGORIES.includes(r.category)&&matchesSuffix(host,r.suffix)).sort((a,b)=>b.suffix.length-a.suffix.length);
  const rule=ordered[0];
  return rule?{category:rule.category,project:rule.project?.trim().slice(0,80)||null}:{category:"Other",project:null};
}
