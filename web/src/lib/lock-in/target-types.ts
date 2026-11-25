export const TARGET_TYPES=["tasks","projects","chapters"] as const;
export type TargetType=typeof TARGET_TYPES[number];
export type Target={type:TargetType;id:number};
export type TargetOption=Target&{title:string;href:string};
export function parseTarget(raw:unknown):Target|null{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
  const r=raw as Record<string,unknown>;
  if(Object.keys(r).some(k=>k!=="type"&&k!=="id")||!TARGET_TYPES.includes(r.type as TargetType)||typeof r.id!=="number"||!Number.isSafeInteger(r.id)||r.id<=0)return null;
  return {type:r.type as TargetType,id:r.id};
}
