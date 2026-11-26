import type { DatabaseSync } from "node:sqlite";

export const AGENTS = [
  { key: "chief", name: "Chief", role: "Orchestrator", brief: "You manage the objective, delegate only necessary specialist work and communicate with the user. Avoid overstating what has been verified." },
  { key: "inventor", name: "Inventor", role: "Idea discovery", brief: "Find useful ideas, connect existing observations, propose a testable hypothesis and identify unresolved assumptions." },
  { key: "researcher", name: "Researcher", role: "Research", brief: "Analyze only supplied evidence and references. No web tools are available in this version: NEVER claim to have browsed or verified external facts. List external research still needed." },
  { key: "strategist", name: "Strategist", role: "Planning", brief: "Turn ideas into concrete objectives, scope, milestones, dependencies, resources, verification criteria and a smallest useful experiment." },
  { key: "critic", name: "Critic", role: "Independent review", brief: "Challenge weak evidence and optimistic assumptions. Find security, feasibility and prioritization risks. State revisions and open questions." },
  { key: "engineer", name: "Engineer", role: "Software", brief: "Review described software design, propose implementation steps and test criteria. Do not claim code was executed or inspected unless source was supplied." },
  { key: "scholar", name: "Scholar", role: "Study", brief: "Analyze provided learning records, explain weak areas and recommend realistic targeted practice. Never fabricate performance results." },
  { key: "analyst", name: "Analyst", role: "Session patterns", brief: "Analyze session summaries carefully. Activity metadata does not prove the steps of a workflow; mark candidate patterns as hypotheses." },
  { key: "operator", name: "Operator", role: "Skills and workflows", brief: "Turn confirmed repeatable behavior into a safe reusable skill proposal: trigger, inputs, steps, outputs, failure and approval points. Do not execute external actions." },
  { key: "archivist", name: "Archivist", role: "Knowledge", brief: "Connect existing ideas, projects and evidence; distinguish recorded facts from hypotheses and avoid inferring private traits." },
  { key: "secretary", name: "Secretary", role: "Calendar and correspondence planning", brief: "Draft schedules, agendas and correspondence using only supplied details. Do not claim any message was sent or appointment booked." },
  { key: "coach", name: "Coach", role: "Sustainable routines", brief: "Propose realistic routines with rest and recovery. Never infer health conditions or treat time observed as attention." },
  { key: "quartermaster", name: "Quartermaster", role: "Resource planning", brief: "Organize supplied resources, identify shortages and suggest alternatives. Do not claim purchases or external verification." },
  { key: "sentinel", name: "Sentinel", role: "Monitoring", brief: "Recommend specific event triggers and checks. Do not claim monitoring is active without a configured connector and running schedule." },
] as const;

export type AgentKey = (typeof AGENTS)[number]["key"];
export type AgentConfig = { key: AgentKey; name: string; role: string; brief: string; enabled: boolean };

export function listAgents(db: DatabaseSync): AgentConfig[] {
  const rows = db.prepare("SELECT agent_key, display_name, enabled FROM dreamer_agent_config").all() as { agent_key: string; display_name: string; enabled: number }[];
  const saved = new Map(rows.map((row) => [row.agent_key, row]));
  return AGENTS.map((agent) => ({
    ...agent,
    name: saved.get(agent.key)?.display_name || agent.name,
    enabled: agent.key === "chief" || saved.get(agent.key)?.enabled !== 0,
  }));
}

export function configureAgent(db: DatabaseSync, key: string, name: string, enabled: boolean): boolean {
  const allowed = AGENTS.find((agent) => agent.key === key);
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!allowed || clean.length < 2 || clean.length > 40 || /[<>{}]/.test(clean)) return false;
  db.prepare("INSERT INTO dreamer_agent_config (agent_key, display_name, enabled) VALUES (?, ?, ?) ON CONFLICT(agent_key) DO UPDATE SET display_name=excluded.display_name, enabled=excluded.enabled")
    .run(key, clean, key === "chief" || enabled ? 1 : 0);
  return true;
}

export function selectSpecialists(objective: string, agents: readonly AgentConfig[]): AgentConfig[] {
  const text = objective.toLowerCase();
  let keys: AgentKey[];
  if (/\b(study|exam|math|physics|chemistry|revision|practice|syllabus)\b/.test(text)) keys = ["scholar", "strategist", "critic"];
  else if (/\b(code|repo|github|software|bug|architecture|pull request|pr)\b/.test(text)) keys = ["engineer", "strategist", "critic"];
  else if (/\b(idea|invent|product|startup|prototype|business)\b/.test(text)) keys = ["inventor", "researcher", "strategist", "critic"];
  else if (/\b(workflow|automate|automation|repeat|skill|session|routine)\b/.test(text)) keys = ["analyst", "operator", "critic"];
  else if (/\b(alert|monitor|watch|deadline|track changes)\b/.test(text)) keys = ["sentinel", "strategist", "critic"];
  else keys = ["archivist", "strategist", "critic"];
  return keys.map((key) => agents.find((agent) => agent.key === key)).filter((agent): agent is AgentConfig => Boolean(agent?.enabled)).slice(0, 4);
}

