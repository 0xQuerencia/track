import Link from "next/link";
import {cookies} from "next/headers";
import {notFound,redirect} from "next/navigation";
import {Page,Panel,StatGrid} from "@/components/track/page";
import {StatCard} from "@/components/track/stat-card";
import {SESSION_COOKIE,verifySessionToken} from "@/lib/session";
import {getDb} from "@/lib/db";
import {resolveTarget} from "@/lib/lock-in/targets";
import {getSession} from "@/lib/lock-in/sessions";
import {reportForSession} from "@/lib/lock-in/report";
import {saveReflectionAction} from "../../report-actions";
export const dynamic="force-dynamic";
const minutes=(n:number|null)=>n===null?null:Math.round(n/6000)/10;
export default async function SessionReport({params}:{params:Promise<{id:string}>}){
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  if(!token||!await verifySessionToken(token))redirect("/login");
  const {id}=await params;
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))notFound();
  const db=getDb(),s=getSession(db,id);
  if(!s||s.endedMs===null||s.outcome!=="saved")notFound();
  const target=s.target?resolveTarget(db,s.target):null;
  const {summary:r,reflection,logExists}=reportForSession(db,s);
  return <Page kicker="Lock-In / Report" title={s.label||"Focus report"} lede="Timer elapsed time is not proof of attention. Device coverage is observed activity within the whole session, including breaks.">
    <StatGrid>
      <StatCard label="Planned focus" value={minutes(r.scheduledFocusMs)} suffix=" min" decimals={1} hint={r.scheduledFocusMs===null?"Flow mode: no fixed target":undefined}/>
      <StatCard label="Elapsed scheduled focus" value={minutes(r.focusMs)} suffix=" min" decimals={1}/>
      <StatCard label="Wall time" value={minutes(r.wallMs)} suffix=" min" decimals={1}/>
      <StatCard label="Breaks" value={minutes(r.breakMs)} suffix=" min" decimals={1}/>
      <StatCard label="Paused" value={minutes(r.pauseMs)} suffix=" min" decimals={1}/>
      <StatCard label="After timer completion" value={minutes(r.overdueMs)} suffix=" min" decimals={1}/>
      <StatCard label="Observed device time" value={minutes(r.observedMs)} suffix=" min" decimals={1}/>
      <StatCard label="Unobserved time" value={minutes(r.unknownMs)} suffix=" min" decimals={1}/>
    </StatGrid>
    {s.target?<Panel title="Linked objective">{target?<Link href={target.href}>{target.title}</Link>:<p>Linked record was removed.</p>}</Panel>:null}
    <Panel title="Reflection" description="Private self-reported outcome, not an AI judgment.">
      <form action={saveReflectionAction} className="tk-stack">
        <input type="hidden" name="id" value={s.id}/>
        <label className="tk-field"><span>Did you achieve your intention?</span><select name="outcome" defaultValue={reflection.outcome}><option value="unset">Not recorded</option><option value="yes">Yes</option><option value="partial">Partly</option><option value="no">Not yet</option></select></label>
        <label className="tk-field"><span>Self-reported distractions</span><input type="number" name="distractions" min={0} max={500} defaultValue={reflection.distractions} required/></label>
        <label className="tk-field"><span>Notes / next step</span><textarea name="notes" rows={4} maxLength={2000} defaultValue={reflection.notes}/></label>
        <button className="tk-button tk-primary" type="submit">Save reflection</button>
      </form>
    </Panel>
    <Panel title="Focus history"><p>{logExists?"A focus log was created when you saved the session.":"No corresponding focus log exists (under one minute or removed)."}</p><Link href="/focus">Open editable focus log</Link></Panel>
    <Link className="tk-button" href="/lock-in">Back to Lock-In</Link>
  </Page>;
}
