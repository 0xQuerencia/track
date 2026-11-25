import Link from "next/link";
import {Page,Panel,StatGrid} from "@/components/track/page";
import {StatCard} from "@/components/track/stat-card";
import {getDb} from "@/lib/db";
import {readActivity} from "@/lib/pulse/store";
import {privacyStatus} from "@/lib/pulse/privacy";
import {changeCollectionAction,pruneActivityAction} from "./actions";
export const dynamic="force-dynamic";
export default function ActivityPage(){
  // This is a dynamic server page; capture the report's real request-time boundary.
  // eslint-disable-next-line react-hooks/purity -- server-only, no React client render
  const now=Date.now();
  const report=readActivity(getDb(),now-86400000,now);
  const privacy=privacyStatus(getDb());
  const mins=(n:number)=>Math.round(n/60000);
  return <Page kicker="Pulse" title="Activity" lede="Observed intervals from opted-in devices. Missing time is unknown, not idle.">
    <StatGrid>
      <StatCard label="Observed time · last 24 hours" value={mins(report.uniqueMs)} suffix=" min"/>
      <StatCard label="Reporting devices" value={Object.keys(report.byDevice).length}/>
      <StatCard label="Observed intervals" value={report.eventCount}/>
    </StatGrid>
    <Link className="tk-button" href="/activity/devices">Pair and manage devices</Link>
    <Panel title="By device" description="Device totals can overlap. Observed time above counts each moment only once.">
      {report.eventCount===0?<p className="tk-empty">No activity received. Create an activity-only integration token in <Link href="/settings">Settings</Link> and pair your collector.</p>:<ul className="tk-list">{Object.entries(report.byDevice).map(([id,ms])=><li key={id}><span>{id}</span><small>{mins(ms)} min</small></li>)}</ul>}
    </Panel>
    <Panel title="Time by category" description="Overlapping categories are counted as mixed. Other includes uncategorized observations; unknown is unobserved time."><ul className="tk-list">{Object.entries(report.categoryMs).map(([name,ms])=><li key={name}><span>{name}</span><small>{mins(ms)} min</small></li>)}</ul></Panel>
    <Panel title="Privacy"><p>Server collection: {privacy.paused?"Paused (incoming intervals discarded)":"Enabled"}.</p><form action={changeCollectionAction}><button className="tk-button" name="action" value={privacy.paused?"resume":"pause"}>{privacy.paused?"Resume collection":"Pause collection"}</button></form><p><a href="/api/activity/export" download>Export activity JSON</a></p><form action={changeCollectionAction}><label><input type="checkbox" name="confirm" required/> Erase all stored activity and pause future collection</label><button className="tk-button tk-danger" name="action" value="erase">Erase activity</button></form><p>Only activity source, timestamps and optional coarse categories are stored. No URLs, page titles, text, or keystrokes. Data older than 30 days is pruned on successful ingestion or a maintenance run; revoking a token stops future collection.</p><form action={pruneActivityAction}><button className="tk-button">Prune expired activity now</button></form></Panel>
  </Page>;
}
