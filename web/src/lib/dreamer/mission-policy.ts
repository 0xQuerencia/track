export type StepState="queued"|"running"|"complete"|"failed"|"cancelled";
export type MissionStep=Readonly<{id:string;dependsOn:readonly string[];state:StepState}>;
const ID=/^[a-zA-Z0-9_-]{1,80}$/;
const STATES=new Set(["queued","running","complete","failed","cancelled"]);
export function validateMission(steps:readonly MissionStep[]):void {
  if(steps.length<1||steps.length>64)throw new RangeError("Invalid mission size");
  const byId=new Map<string,MissionStep>();
  for(const s of steps){
    if(!ID.test(s.id)||byId.has(s.id)||!STATES.has(s.state)||s.dependsOn.length>64||new Set(s.dependsOn).size!==s.dependsOn.length)throw new Error("Invalid mission step");
    byId.set(s.id,s);
  }
  const active=new Set<string>(),done=new Set<string>();
  function visit(id:string){
    if(active.has(id))throw new Error("Cyclic mission dependencies");
    if(done.has(id))return;
    const step=byId.get(id);
    if(!step)throw new Error("Unknown mission dependency");
    active.add(id);
    for(const dep of step.dependsOn)visit(dep);
    active.delete(id);done.add(id);
  }
  for(const id of byId.keys())visit(id);
}
export function readySteps(steps:readonly MissionStep[]):string[]{
  validateMission(steps);
  const completed=new Set(steps.filter(s=>s.state==="complete").map(s=>s.id));
  return steps.filter(s=>s.state==="queued"&&s.dependsOn.every(d=>completed.has(d))).map(s=>s.id);
}
export type ToolRisk="read"|"reversible_write"|"external_write"|"destructive"|"spending"|"deployment";
export type ToolCapability=Readonly<{name:string;scope:string;risk:ToolRisk}>;
export type PolicyContext=Readonly<{enabled:boolean;killSwitch:boolean;consent:boolean;scopes:readonly string[];allowReversibleWrites:boolean}>;
export type PolicyDecision="deny"|"allow"|"approval_required";
const RISKS=new Set(["read","reversible_write","external_write","destructive","spending","deployment"]);
/** Decision only. An approval-required action must NOT execute without a separate
 * persisted, exact-action approval verified by the eventual executor. */
export function toolDecision(registry:readonly ToolCapability[],name:string,context:PolicyContext):PolicyDecision{
  if(!context.enabled||context.killSwitch||!context.consent)return "deny";
  const matches=registry.filter(t=>t.name===name);
  if(matches.length!==1)return "deny";
  const tool=matches[0];
  if(!tool.scope||!context.scopes.includes(tool.scope)||!RISKS.has(tool.risk))return "deny";
  if(tool.risk==="read")return "allow";
  if(tool.risk==="reversible_write"&&context.allowReversibleWrites)return "allow";
  return "approval_required";
}
