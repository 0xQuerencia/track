import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const ASSETS=["worker.js","tracker.mjs","rules.mjs","blocker.mjs","popup.html","popup.css","popup.js"];
export function manifestFor(source,target){
  const manifest=structuredClone(source);
  if(target==="chromium")return manifest;
  if(target!=="firefox")throw new Error("Target must be chromium or firefox");
  delete manifest.minimum_chrome_version;
  manifest.background={scripts:["worker.js"],type:"module",persistent:false};
  manifest.browser_specific_settings={gecko:{id:"track-pulse@querencia.art",strict_min_version:"128.0"}};
  return manifest;
}
export async function build(target,root=here){
  const manifest=manifestFor(JSON.parse(await fs.readFile(path.join(root,"manifest.json"),"utf8")),target);
  const dest=path.join(root,"dist",target);
  await fs.mkdir(path.join(root,"dist"),{recursive:true});
  const tmp=await fs.mkdtemp(path.join(root,"dist",target+"-"));
  try{
    await Promise.all(ASSETS.map(name=>fs.copyFile(path.join(root,name),path.join(tmp,name))));
    await fs.writeFile(path.join(tmp,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
    await fs.rm(dest,{recursive:true,force:true});
    await fs.rename(tmp,dest);
    return dest;
  }finally{await fs.rm(tmp,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const targets=process.argv[2]?[process.argv[2]]:["chromium","firefox"];
  for(const target of targets)console.log(await build(target));
}
