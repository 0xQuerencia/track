import Link from "next/link";
import {Page,Panel,StatGrid} from "@/components/track/page";
import {StatCard} from "@/components/track/stat-card";
import {getDb} from "@/lib/db";
import {readActivity} from "@/lib/pulse/store";
export const dynamic="force-dynamic";
export default function ActivityPage(){
  const now=Date.now();
  const report=readActivity(getDb(),now-86400000,now);
  const mins=(n:number)=>Math.round(n/60000);
  return <Page kicker="Pulse" title="Activity" lede="Observed intervals from opted-in devices. Missing time is unknown, not idle.">
    <StatGrid>
      <StatCard label="Observed time · last 24 hours" value={mins(report.uniqueMs)} suffix=" min"/>
      <StatCard label="Reporting devices" value={Object.keys(report.byDevice).length}/>
      <StatCard label="Observed intervals" value={report.eventCount}/>
    </StatGrid>
    <Panel title="By device" description="Device totals can overlap. Observed time above counts each moment only once.">
      {report.eventCount===0?<p className="tk-empty">No activity received. Create an activity-only integration token in <Link href="/settings">Settings</Link> and pair your collector.</p>:<ul className="tk-list">{Object.entries(report.byDevice).map(([id,ms])=><li key={id}><span>{id}</span><small>{mins(ms)} min</small></li>)}</ul>}
    </Panel>
    <Panel title="Privacy"><p>Only activity source and timestamps are stored. No URLs, page titles, text, or keystrokes. Data older than 30 days is pruned on successful ingestion; revoking a token stops future collection.</p></Panel>
  </Page>;
}
