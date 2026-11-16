import Link from "next/link";
import { Markdown } from "@/components/track/markdown";
import { Panel } from "@/components/track/page";
import { getDb } from "@/lib/db";
import { getAiStatus, getConsent } from "@/lib/ai";
import { listAgents } from "@/lib/dreamer/agents";
import { listChiefMessages, listMissions } from "@/lib/dreamer/chief";
import { discoverWorkflowCandidates, listCandidates, listSkills } from "@/lib/dreamer/workflows";
import { ChiefComposer } from "./chief-composer";
import { reviewWorkflowCandidateAction, updateDreamerAgentAction } from "./collective-actions";

export function ChiefPanel() {
  const db=getDb();
  discoverWorkflowCandidates(db);
  const messages=listChiefMessages(db);
  const missions=listMissions(db);
  const agents=listAgents(db);
  const candidates=listCandidates(db);
  const skills=listSkills(db);
  const consent=getConsent(db,"dreamer");
  const ai=getAiStatus(db);
  return (
    <div className="dreamer-chief">
      <Panel title="Chief" description="One conversation. Specialists plan, analyze and critique privately; Chief returns a single answer.">
        {!consent.enabled || !ai.keyConfigured || ai.killSwitch ?
          <p className="dreamer-notice" role="status">AI delegation is currently unavailable. Check the provider key, AI kill switch and Dreamer consent in <Link href="/dreamer?tab=sources">Sources & Privacy</Link>. Local insights and workflow discovery continue to work.</p>
          : null}
        <div className="dreamer-chief-history" aria-live="polite">
          {messages.length ? messages.map((message)=>(
            <article key={message.id} className="dreamer-chief-turn" data-role={message.role}>
              <div className="dreamer-chief-turn-head">{message.role==="chief"?(agents.find((a)=>a.key==="chief")?.name??"Chief"):"You"} <time>{message.created_at}</time></div>
              {message.role==="chief"?<Markdown source={message.text}/>:<p>{message.text}</p>}
              {message.mission_id ? <details className="dreamer-chief-trace">
                <summary>Specialist work &amp; provenance</summary>
                {missions.find((mission)=>mission.id===message.mission_id) ? <p className="dreamer-muted">Mission #{message.mission_id} · {missions.find((mission)=>mission.id===message.mission_id)?.state}</p>:null}
                <MissionSteps missionId={message.mission_id}/>
              </details> : null}
            </article>
          )):<p className="tk-empty">Ask Chief to investigate an idea, develop a plan, critique a proposal, or find repeatable work in your Track sessions.</p>}
        </div>
        <ChiefComposer/>
      </Panel>

      <Panel title="Skill candidates" description="Local session patterns worth discussing with Chief. Metadata suggests repetition but cannot confirm an exact workflow.">
        {candidates.length===0?<p className="tk-empty">No repeated session patterns have met the evidence threshold yet.</p>:(
          <div className="dreamer-chief-candidates">{candidates.map((candidate)=>(
            <article className="dreamer-chief-candidate" key={candidate.id}>
              <div><b>{candidate.title}</b><p>{candidate.occurrences} recorded sessions · {candidate.sourceKind.replaceAll("_"," ")} · {candidate.state}</p></div>
              <details><summary>Why was this suggested?</summary><ul>{candidate.evidence.slice(0,6).map((item)=><li key={item.id}>{item.date} · {item.title||"Untitled session"}</li>)}</ul><p>Only session metadata was examined; the actual steps must be confirmed.</p></details>
              {candidate.state==="suggested"?<div className="dreamer-actions">
                <form action={reviewWorkflowCandidateAction}><input type="hidden" name="id" value={candidate.id}/><button className="tk-button tk-ghost" type="submit" name="action" value="save">Save draft skill</button></form>
                <form action={reviewWorkflowCandidateAction}><input type="hidden" name="id" value={candidate.id}/><button className="tk-button tk-ghost" type="submit" name="action" value="dismiss">Dismiss</button></form>
              </div>:null}
            </article>
          ))}</div>
        )}
        {skills.length ? <details className="dreamer-chief-skills"><summary>Saved skill drafts ({skills.length})</summary>{skills.map((skill)=><article key={skill.id}><b>{skill.name}</b><span> · {skill.state} · not scheduled</span><Markdown source={skill.spec}/></article>)}</details>:null}
      </Panel>

      <details className="dreamer-chief-settings">
        <summary>Customize specialists</summary>
        <p>Rename specialists or pause their participation. Chief is always available as your single interface. Internal roles and safety boundaries cannot be overridden by display names.</p>
        <div className="dreamer-chief-agent-grid">
          {agents.map((agent)=><form className="dreamer-chief-agent" action={updateDreamerAgentAction} key={agent.key}>
            <input type="hidden" name="key" value={agent.key}/>
            <label>{agent.role}<input type="text" name="name" defaultValue={agent.name} minLength={2} maxLength={40} required/></label>
            <label><input type="checkbox" name="enabled" defaultChecked={agent.enabled} disabled={agent.key==="chief"}/> Enabled</label>
            <button className="tk-button tk-ghost" type="submit">Save</button>
          </form>)}
        </div>
      </details>
    </div>
  );
}

function MissionSteps({missionId}:{missionId:number}) {
  const db=getDb();
  const rows=db.prepare("SELECT id,agent_key,output_md FROM dreamer_agent_steps WHERE mission_id=? ORDER BY id").all(missionId) as {id:number;agent_key:string;output_md:string}[];
  const names=new Map<string,string>(listAgents(db).map((agent)=>[agent.key,agent.name]));
  return rows.length?<div className="dreamer-chief-steps">{rows.map((row)=><section key={row.id}><b>{names.get(row.agent_key)??row.agent_key}</b><Markdown source={row.output_md}/></section>)}</div>:<p>No specialist output was saved for this mission.</p>;
}

