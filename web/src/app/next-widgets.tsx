import Link from "next/link";
import {StatCard} from "@/components/track/stat-card";
import type {WidgetSpec} from "@/components/track/widget-board";
import {getDb} from "@/lib/db";
import {nextOverview} from "@/lib/command-center";
const mins=(n:number|null)=>n===null?null:Math.round(n/60000);
export function nextWidgets(now:number):WidgetSpec[]{
 const v=nextOverview(getDb(),now,process.env.TRACK_TZ??"UTC");
 return [{
  id:"lock-in",title:"Lock-In",content:<div className="tk-stack"><p>{v.session?<><strong>{v.session.label||"Focus session"}</strong> · {v.session.paused?"Paused":v.session.phase.replaceAll("_"," ")}</>:<>No active focus session.</>}</p><Link className="tk-button" href="/lock-in">{v.session?"Open live session":"Start a focus session"}</Link></div>
 },{
  id:"pulse-coverage",title:"Activity coverage today",content:<div className="tk-stack"><div className="tk-mini-stats"><StatCard label="Observed" value={mins(v.observedMs)} suffix=" min"/><StatCard label="Unknown" value={mins(v.unknownMs)} suffix=" min"/></div><p>{v.paused?"Collection paused":v.pairedDevices?"Collection enabled":"No device paired"} · {v.reportingDevices}/{v.pairedDevices} devices received data in 24h</p><small>Unknown does not mean idle. These figures do not measure attention.</small><p><Link href="/activity/analytics">Activity history</Link> · <Link href="/activity/devices">Manage devices</Link></p></div>
 },{
  id:"mission-queue",title:"Dreamer Mission Control",content:<div className="tk-stack"><div className="tk-mini-stats"><StatCard label="Queued" value={v.queued}/><StatCard label="Running" value={v.running}/><StatCard label="Awaiting approval" value={v.pending}/></div><p>{v.worker.online?"Worker heartbeat received":"Worker offline · missions wait"}</p><p><Link href="/dreamer/missions">Missions</Link> · <Link href="/dreamer/inbox">Approvals</Link> · <Link href="/dreamer/sentinel">Watches</Link></p></div>
 }];
}
