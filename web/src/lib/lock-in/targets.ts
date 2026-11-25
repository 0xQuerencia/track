import type {DatabaseSync} from "node:sqlite";
import {ENTITY_LIST,entityRecordHref} from "../entities";
import {TARGET_TYPES,parseTarget,type Target,type TargetOption} from "./target-types";

export function resolveTarget(db:DatabaseSync,target:Target):TargetOption|null{
  const valid=parseTarget(target);
  if(!valid)return null;
  const entity=ENTITY_LIST.find(e=>e.key===valid.type)!;
  const row=db.prepare("SELECT id, "+entity.titleField+" AS title FROM "+entity.key+" WHERE id=?").get(valid.id) as {id:number;title:string}|undefined;
  return row?{...valid,title:row.title,href:entityRecordHref(entity,row.id)}:null;
}
export function listTargets(db:DatabaseSync):TargetOption[]{
  return TARGET_TYPES.flatMap(type=>{
    const entity=ENTITY_LIST.find(e=>e.key===type)!;
    const rows=db.prepare("SELECT id, "+entity.titleField+" AS title FROM "+entity.key+" ORDER BY "+entity.orderBy+" LIMIT 100").all() as {id:number;title:string}[];
    return rows.map(r=>({type,id:r.id,title:r.title,href:entityRecordHref(entity,r.id)}));
  });
}
